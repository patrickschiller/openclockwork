import {
  createTestApp,
  login,
  seedEmployee,
  type TestContext,
} from '../support/test-app';

describe('Terminal PIN credentials and configuration', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    process.env.TERMINAL_PIN_PEPPER ??=
      'synthetic-e2e-pin-pepper-at-least-32-characters';
    process.env.TERMINAL_AUDIT_KEY ??=
      'synthetic-e2e-audit-key-at-least-32-characters';
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
  });

  async function actors() {
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: 'PIN-HR',
      firstName: 'Hannah',
      lastName: 'Administrator',
      email: 'hr@pin-credentials.test',
      role: 'HRAdmin',
    });
    const manager = await seedEmployee(ctx.prisma, {
      personalNo: 'PIN-MANAGER',
      firstName: 'Mark',
      lastName: 'Manager',
      email: 'manager@pin-credentials.test',
      role: 'Manager',
    });
    const employee = await seedEmployee(ctx.prisma, {
      personalNo: '000007',
      firstName: 'Erika',
      lastName: 'Employee',
      email: 'employee@pin-credentials.test',
    });
    return {
      hr,
      manager,
      employee,
      hrToken: await login(ctx.http, hr.email),
      managerToken: await login(ctx.http, manager.email),
      employeeToken: await login(ctx.http, employee.email),
    };
  }

  function credentials(employeeId: string) {
    return `/api/employees/${employeeId}/terminal-credentials`;
  }

  async function createTerminal(hrToken: string, methods?: string[]) {
    return ctx.http
      .post('/api/terminals')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        name: 'Synthetic PIN test terminal',
        displayText: 'Synthetic terminal',
        locationLabel: 'Synthetic test reception',
        timeZone: 'Europe/Berlin',
        enforceGeofence: false,
        isActive: true,
        ...(methods ? { allowedAuthMethods: methods } : {}),
      })
      .expect(201);
  }

  it('defaults to QR only and rejects empty, unknown and RFID method selections', async () => {
    const { hrToken } = await actors();
    const created = await createTerminal(hrToken);
    expect(created.body.allowedAuthMethods).toEqual(['QR']);
    for (const methods of [[], ['RFID'], ['UNKNOWN'], ['PIN', 'PIN']]) {
      await ctx.http
        .put(`/api/terminals/${created.body.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ allowedAuthMethods: methods })
        .expect(400);
    }
    const before = await ctx.prisma.terminal.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    const updated = await ctx.http
      .put(`/api/terminals/${created.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ allowedAuthMethods: ['QR', 'PIN'] })
      .expect(200);
    expect(updated.body.allowedAuthMethods).toEqual(['QR', 'PIN']);
    const after = await ctx.prisma.terminal.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(after.authConfigVersion).toBeGreaterThan(before.authConfigVersion);
    expect(await ctx.prisma.timeEntry.count()).toBe(0);
  });

  it('allows only HR to read, reset, disable and unlock another employee PIN', async () => {
    const { employee, hrToken, managerToken, employeeToken } = await actors();
    for (const token of [managerToken, employeeToken]) {
      const auth = `Bearer ${token}`;
      await ctx.http
        .get(credentials(employee.id))
        .set('Authorization', auth)
        .expect(403);
      await ctx.http
        .post(`${credentials(employee.id)}/pin/reset`)
        .set('Authorization', auth)
        .send({})
        .expect(403);
      await ctx.http
        .delete(`${credentials(employee.id)}/pin`)
        .set('Authorization', auth)
        .expect(403);
      await ctx.http
        .post(`${credentials(employee.id)}/pin/unlock`)
        .set('Authorization', auth)
        .send({})
        .expect(403);
    }
    await ctx.http
      .post(`${credentials(employee.id)}/pin/reset`)
      .send({})
      .expect(401);
    const before = await ctx.http
      .get(credentials(employee.id))
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    expect(before.body).toMatchObject({
      method: 'PIN',
      isConfigured: false,
      enabled: false,
    });
    expect(await ctx.prisma.terminalCredential.count()).toBe(0);
    await ctx.http
      .post(`${credentials(employee.id)}/rfid`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ cardValue: '00001234' })
      .expect(404);
  });

  it('disables QR on the server and omits its display challenge on a PIN-only terminal', async () => {
    const { hrToken, employeeToken } = await actors();
    const created = await createTerminal(hrToken, ['QR', 'PIN']);
    const pairing = await ctx.http
      .post(`/api/terminals/${created.body.id}/pairing`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(201);
    const paired = await ctx.http
      .post('/api/terminals/pair')
      .send({ pairingCode: pairing.body.pairingCode })
      .expect(201);
    const display = await ctx.http
      .get('/api/terminals/kiosk')
      .set('Authorization', `Bearer ${paired.body.deviceToken}`)
      .expect(200);
    await ctx.http
      .put(`/api/terminals/${created.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ allowedAuthMethods: ['PIN'] })
      .expect(200);
    const current = await ctx.http
      .get('/api/terminals/kiosk')
      .set('Authorization', `Bearer ${paired.body.deviceToken}`)
      .expect(200);
    expect(current.body.challenge).toBeNull();
    expect(current.body.terminal.allowedAuthMethods).toEqual(['PIN']);
    const disabled = await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ qrPayload: display.body.challenge.payload })
      .expect(403);
    expect(disabled.body.code).toBe('TERMINAL_METHOD_DISABLED');
    expect(await ctx.prisma.timeEntry.count()).toBe(0);
  });

  it('shows a random eight-digit PIN once and stores only a salted Argon2id hash', async () => {
    const { employee, hrToken, employeeToken } = await actors();
    const reset = await ctx.http
      .post(`${credentials(employee.id)}/pin/reset`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({})
      .expect(201);
    expect(reset.headers['cache-control']).toContain('no-store');
    expect(reset.body.pin).toMatch(/^\d{8}$/);
    expect(reset.body.credential).toMatchObject({
      method: 'PIN',
      isConfigured: true,
      enabled: true,
    });
    const stored = await ctx.prisma.terminalCredential.findUniqueOrThrow({
      where: { employeeId: employee.id },
    });
    expect(stored.pinHash).toMatch(/^\$argon2id\$v=19\$/);
    expect(stored.pinHash).not.toContain(reset.body.pin);
    expect(stored.pepperVersion).toBeTruthy();
    const status = await ctx.http
      .get(credentials(employee.id))
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    const employeeView = await ctx.http
      .get(`/api/employees/${employee.id}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    const employeeList = await ctx.http
      .get('/api/employees')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    for (const body of [status.body, employeeView.body, employeeList.body]) {
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain(reset.body.pin);
      expect(serialized).not.toContain(stored.pinHash);
      expect(serialized).not.toMatch(
        /pinHash|pepperVersion|terminalCredentials?/,
      );
    }
    const replaced = await ctx.http
      .post(`${credentials(employee.id)}/pin/reset`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({})
      .expect(201);
    const replacedStored =
      await ctx.prisma.terminalCredential.findUniqueOrThrow({
        where: { employeeId: employee.id },
      });
    expect(replacedStored.version).toBeGreaterThan(stored.version);
    expect(replacedStored.pinHash).not.toBe(stored.pinHash);
    expect(await ctx.prisma.terminalCredential.count()).toBe(1);
    expect(replaced.body.pin).toMatch(/^\d{8}$/);
  });

  it('does not replace a web password when a PIN is reset, disabled or unlocked', async () => {
    const { employee, hrToken } = await actors();
    const reset = await ctx.http
      .post(`${credentials(employee.id)}/pin/reset`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({})
      .expect(201);
    const disabled = await ctx.http
      .delete(`${credentials(employee.id)}/pin`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    expect(disabled.body.enabled).toBe(false);
    await ctx.http
      .post(`${credentials(employee.id)}/pin/unlock`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({})
      .expect(404);
    const status = await ctx.http
      .get(credentials(employee.id))
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    expect(status.body.enabled).toBe(false);
    await login(ctx.http, employee.email);
    await ctx.http
      .post('/api/auth/login')
      .send({ email: employee.email, password: reset.body.pin })
      .expect(401);
    const stored = await ctx.prisma.employee.findUniqueOrThrow({
      where: { id: employee.id },
    });
    expect(stored.passwordHash).toBe(employee.passwordHash);
  });

  it('rejects credential and terminal administration in Solo mode', async () => {
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: 'SOLO-PIN-HR',
      firstName: 'Solo',
      lastName: 'Owner',
      email: 'solo@pin-credentials.test',
      role: 'HRAdmin',
    });
    const token = await login(ctx.http, hr.email);
    await ctx.http
      .post('/api/installation/mode')
      .set('Authorization', `Bearer ${token}`)
      .send({ mode: 'Solo', revision: 0 })
      .expect(201);
    await ctx.http
      .post(`${credentials(hr.id)}/pin/reset`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(403);
    await ctx.http
      .get(credentials(hr.id))
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    await ctx.http
      .post('/api/terminals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Forbidden Solo terminal',
        enforceGeofence: false,
        allowedAuthMethods: ['PIN'],
      })
      .expect(403);
    expect(await ctx.prisma.terminalCredential.count()).toBe(0);
    expect(await ctx.prisma.terminal.count()).toBe(0);
  });
});
