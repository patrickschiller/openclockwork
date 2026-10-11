import {
  createTestApp,
  login,
  seedEmployee,
  type TestContext,
} from '../support/test-app';

describe('Device-bound terminal PIN identification', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
  });

  async function fixture() {
    const hr = await seedEmployee(ctx.prisma, {
      personalNo: 'AUTH-HR',
      firstName: 'Hannah',
      lastName: 'Administrator',
      email: 'hr@pin-auth.test',
      role: 'HRAdmin',
    });
    const employee = await seedEmployee(ctx.prisma, {
      personalNo: '000007',
      firstName: 'Erika',
      lastName: 'Employee',
      email: 'employee@pin-auth.test',
    });
    const hrToken = await login(ctx.http, hr.email);
    const employeeToken = await login(ctx.http, employee.email);
    const reset = await ctx.http
      .post(`/api/employees/${employee.id}/terminal-credentials/pin/reset`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({})
      .expect(201);
    const device = await terminal(hrToken);
    return {
      hr,
      employee,
      hrToken,
      employeeToken,
      pin: reset.body.pin as string,
      ...device,
    };
  }

  async function terminal(hrToken: string, methods = ['QR', 'PIN']) {
    const created = await ctx.http
      .post('/api/terminals')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        name: 'Synthetic PIN authentication',
        displayText: 'Synthetic terminal',
        locationLabel: 'Synthetic reception',
        timeZone: 'Europe/Berlin',
        enforceGeofence: false,
        isActive: true,
        allowedAuthMethods: methods,
      })
      .expect(201);
    const pairing = await ctx.http
      .post(`/api/terminals/${created.body.id}/pairing`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(201);
    const paired = await ctx.http
      .post('/api/terminals/pair')
      .send({
        pairingCode: pairing.body.pairingCode,
        deviceName: 'Synthetic test kiosk',
      })
      .expect(201);
    return {
      terminalId: created.body.id as string,
      deviceToken: paired.body.deviceToken as string,
    };
  }

  async function challenge(deviceToken: string, instance = ctx) {
    const result = await instance.http
      .post('/api/terminals/kiosk/challenge')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({})
      .expect(201);
    expect(result.headers['cache-control']).toContain('no-store');
    return result.body.payload as string;
  }

  function identify(
    instance: TestContext,
    deviceToken: string,
    payload: string,
    personalNo: string,
    pin: string,
    extra: Record<string, unknown> = {},
  ) {
    return instance.http
      .post('/api/terminals/kiosk/identify')
      .set('Authorization', `Bearer ${deviceToken}`)
      .send({
        method: 'PIN',
        challengePayload: payload,
        personalNo,
        pin,
        ...extra,
      });
  }

  const wrongPin = (pin: string) =>
    `${pin[0] === '0' ? '1' : '0'}${pin.slice(1)}`;

  async function withConfiguration(
    values: Record<string, string | undefined>,
    run: (instance: TestContext) => Promise<void>,
  ) {
    const prior = new Map(
      Object.keys(values).map((key) => [key, process.env[key]]),
    );
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    let instance: TestContext | undefined;
    try {
      instance = await createTestApp();
      await run(instance);
    } finally {
      if (instance) await instance.close();
      for (const [key, value] of prior) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it('preserves personal-number zeros, identifies without booking and returns only a scoped grant', async () => {
    const f = await fixture();
    const payload = await challenge(f.deviceToken);
    await identify(ctx, f.deviceToken, payload, '7', f.pin).expect(401);
    const result = await identify(
      ctx,
      f.deviceToken,
      payload,
      f.employee.personalNo,
      f.pin,
      { employeeId: f.hr.id },
    ).expect(201);
    expect(result.headers['cache-control']).toContain('no-store');
    expect(Object.keys(result.body).sort()).toEqual([
      'action',
      'displayName',
      'expiresAt',
      'grant',
      'requiresLocation',
    ]);
    expect(result.body).toMatchObject({
      action: 'clock-in',
      requiresLocation: false,
    });
    expect(result.body.displayName).toContain(f.employee.firstName);
    expect(result.body.displayName).not.toContain(f.employee.lastName);
    expect(result.body.expiresAt).toBeTruthy();
    expect(
      new Date(result.body.expiresAt).getTime() - Date.now(),
    ).toBeLessThanOrEqual(30_000);
    expect(JSON.stringify(result.body)).not.toMatch(
      /personalNo|email|accessToken|refreshToken|employeeId/,
    );
    expect(await ctx.prisma.timeEntry.count()).toBe(0);
    expect(await ctx.prisma.terminalChallengeRedemption.count()).toBe(0);
    const stored = await ctx.prisma.terminalBookingGrant.findFirstOrThrow();
    expect(stored.employeeId).toBe(f.employee.id);
    expect(stored.consumedAt).toBeNull();
    expect(stored.tokenHash).not.toBe(result.body.grant);
    expect(stored.tokenHash).not.toContain(result.body.grant);
    for (const token of [f.deviceToken, result.body.grant]) {
      await ctx.http
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      await ctx.http
        .get('/api/employees')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      await ctx.http
        .post('/api/auth/refresh')
        .send({ refreshToken: token })
        .expect(401);
    }
    await ctx.http
      .post('/api/terminals/kiosk/challenge')
      .set('Authorization', `Bearer ${f.employeeToken}`)
      .send({})
      .expect(401);
  });

  it('separates display QR challenges from kiosk-identify challenges and rejects a foreign device', async () => {
    const f = await fixture();
    const foreign = await terminal(f.hrToken);
    const display = await ctx.http
      .get('/api/terminals/kiosk')
      .set('Authorization', `Bearer ${f.deviceToken}`)
      .expect(200);
    await identify(
      ctx,
      f.deviceToken,
      display.body.challenge.payload,
      f.employee.personalNo,
      f.pin,
    ).expect(409);
    const payload = await challenge(f.deviceToken);
    await identify(
      ctx,
      foreign.deviceToken,
      payload,
      f.employee.personalNo,
      f.pin,
    ).expect(409);
    await ctx.http
      .post('/api/terminals/scan')
      .set('Authorization', `Bearer ${f.employeeToken}`)
      .send({ qrPayload: payload })
      .expect(400);
    await ctx.http
      .post('/api/terminals/kiosk/identify')
      .set('Authorization', `Bearer ${f.deviceToken}`)
      .send({
        method: 'RFID',
        challengePayload: payload,
        cardValue: '00001234',
      })
      .expect(400);
    expect(await ctx.prisma.terminalBookingGrant.count()).toBe(0);
    expect(await ctx.prisma.timeEntry.count()).toBe(0);
  });

  it('returns neutral errors for wrong, unknown, inactive and disabled credentials without unpairing', async () => {
    const f = await fixture();
    const payload = await challenge(f.deviceToken);
    const wrong = await identify(
      ctx,
      f.deviceToken,
      payload,
      f.employee.personalNo,
      wrongPin(f.pin),
    ).expect(401);
    const unknown = await identify(
      ctx,
      f.deviceToken,
      payload,
      'UNKNOWN-PRIVATE-NUMBER',
      f.pin,
    ).expect(401);
    await ctx.prisma.employee.update({
      where: { id: f.employee.id },
      data: { isActive: false },
    });
    const inactive = await identify(
      ctx,
      f.deviceToken,
      payload,
      f.employee.personalNo,
      f.pin,
    ).expect(401);
    await ctx.prisma.employee.update({
      where: { id: f.employee.id },
      data: { isActive: true },
    });
    await ctx.http
      .delete(`/api/employees/${f.employee.id}/terminal-credentials/pin`)
      .set('Authorization', `Bearer ${f.hrToken}`)
      .expect(200);
    const disabled = await identify(
      ctx,
      f.deviceToken,
      payload,
      f.employee.personalNo,
      f.pin,
    ).expect(401);
    for (const result of [wrong, unknown, inactive, disabled]) {
      expect(result.body).toEqual(wrong.body);
      expect(result.body.code).toBe('TERMINAL_AUTH_FAILED');
      expect(JSON.stringify(result.body)).not.toMatch(
        /Erika|Employee|000007|lockedUntil|employeeId/,
      );
      expect(result.headers['cache-control']).toContain('no-store');
    }
    await ctx.http
      .get('/api/terminals/kiosk')
      .set('Authorization', `Bearer ${f.deviceToken}`)
      .expect(200);
    expect(await ctx.prisma.timeEntry.count()).toBe(0);
    expect(await ctx.prisma.terminalBookingGrant.count()).toBe(0);
    const failures = await ctx.prisma.terminalAuditEvent.findMany({
      where: { event: 'IdentificationRejected', result: 'AUTH_FAILED' },
    });
    expect(failures).toHaveLength(4);
    expect(
      failures.filter((event) => event.employeeId === f.employee.id),
    ).toHaveLength(3);
    expect(failures.filter((event) => event.employeeId === null)).toHaveLength(
      1,
    );
    for (const event of failures) {
      expect(event.canonicalPayload).not.toContain(f.pin);
      expect(event.canonicalPayload).not.toContain('UNKNOWN-PRIVATE-NUMBER');
      expect(event.canonicalPayload).not.toContain(f.deviceToken);
    }
  });

  it('rejects numeric, oversized and malformed credentials before granting access', async () => {
    const f = await fixture();
    const payload = await challenge(f.deviceToken);
    for (const body of [
      { personalNo: 7, pin: f.pin },
      { personalNo: f.employee.personalNo, pin: Number(f.pin) },
      { personalNo: 'X'.repeat(101), pin: f.pin },
      { personalNo: f.employee.personalNo, pin: '1234567' },
      { personalNo: f.employee.personalNo, pin: 'abcdefgh' },
    ]) {
      await ctx.http
        .post('/api/terminals/kiosk/identify')
        .set('Authorization', `Bearer ${f.deviceToken}`)
        .send({ method: 'PIN', challengePayload: payload, ...body })
        .expect(400);
    }
    expect(await ctx.prisma.terminalBookingGrant.count()).toBe(0);
    expect(await ctx.prisma.timeEntry.count()).toBe(0);
  });

  it('shares employee lockout across three independent API instances and retains it after restart', async () => {
    const f = await fixture();
    const secondTerminal = await terminal(f.hrToken);
    let second: TestContext | undefined;
    let third: TestContext | undefined;
    try {
      second = await createTestApp();
      third = await createTestApp();
      const firstPayload = await challenge(f.deviceToken);
      const secondPayload = await challenge(secondTerminal.deviceToken, second);
      const instances = [ctx, second, third];
      const attempts = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          identify(
            instances[index % 3],
            index % 2 ? secondTerminal.deviceToken : f.deviceToken,
            index % 2 ? secondPayload : firstPayload,
            f.employee.personalNo,
            wrongPin(f.pin),
          ),
        ),
      );
      expect(attempts.map((response) => response.status)).toEqual([
        401, 401, 401, 401, 401,
      ]);
      const state = await ctx.prisma.terminalAuthAttemptState.findUniqueOrThrow(
        {
          where: { key: `pin:${f.employee.id}` },
        },
      );
      expect(state.counter).toBe(5);
      expect(state.lockedUntil).not.toBeNull();
      expect(state.lockedUntil?.getTime()).toBeGreaterThan(
        Date.now() + 14 * 60_000,
      );
      await second.close();
      second = await createTestApp();
      const blocked = await identify(
        second,
        secondTerminal.deviceToken,
        secondPayload,
        f.employee.personalNo,
        f.pin,
      ).expect(401);
      expect(blocked.body).toEqual(attempts[0].body);
      await ctx.http
        .post(`/api/employees/${f.employee.id}/terminal-credentials/pin/unlock`)
        .set('Authorization', `Bearer ${f.hrToken}`)
        .send({})
        .expect(201);
      await identify(
        third,
        f.deviceToken,
        firstPayload,
        f.employee.personalNo,
        f.pin,
      ).expect(201);
      expect(await ctx.prisma.timeEntry.count()).toBe(0);
    } finally {
      if (second) await second.close();
      if (third) await third.close();
    }
  });

  it('enforces a device budget before unbounded unknown-person state can grow', async () => {
    const f = await fixture();
    const payload = await challenge(f.deviceToken);
    let limited: Awaited<ReturnType<typeof identify>> | undefined;
    const base = Date.now();
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout'],
    });
    jest.setSystemTime(base);
    try {
      for (let attempt = 0; attempt < 62; attempt += 1) {
        // Advance only between bursts so the minute budget is exercised too.
        jest.setSystemTime(base + Math.floor(attempt / 20) * 11_000);
        const result = await identify(
          ctx,
          f.deviceToken,
          payload,
          `UNKNOWN-${attempt}`,
          f.pin,
        );
        if (result.status === 429) {
          expect(attempt).toBe(60);
          limited = result;
          break;
        }
        expect(result.status).toBe(401);
      }
    } finally {
      jest.useRealTimers();
    }
    expect(limited).toBeDefined();
    expect(limited?.body.code).toBe('TERMINAL_AUTH_RATE_LIMITED');
    expect(Number(limited?.headers['retry-after'])).toBeGreaterThan(0);
    expect(
      await ctx.prisma.terminalAuthAttemptState.count({
        where: { key: { startsWith: 'pin:' } },
      }),
    ).toBe(0);
    expect(await ctx.prisma.terminalAuthAttemptState.count()).toBeLessThan(10);
    expect(await ctx.prisma.terminalBookingGrant.count()).toBe(0);
  });

  it('checks the current method and device state before issuing grants', async () => {
    const f = await fixture();
    const payload = await challenge(f.deviceToken);
    await ctx.http
      .put(`/api/terminals/${f.terminalId}`)
      .set('Authorization', `Bearer ${f.hrToken}`)
      .send({ allowedAuthMethods: ['QR'] })
      .expect(200);
    const methodDisabled = await identify(
      ctx,
      f.deviceToken,
      payload,
      f.employee.personalNo,
      f.pin,
    ).expect(403);
    expect(methodDisabled.body.code).toBe('TERMINAL_METHOD_DISABLED');
    await ctx.http
      .put(`/api/terminals/${f.terminalId}`)
      .set('Authorization', `Bearer ${f.hrToken}`)
      .send({ allowedAuthMethods: ['QR', 'PIN'] })
      .expect(200);
    const admin = await ctx.http
      .get(`/api/terminals/${f.terminalId}`)
      .set('Authorization', `Bearer ${f.hrToken}`)
      .expect(200);
    const device = admin.body.devices.find(
      (item: { revokedAt: string | null }) => item.revokedAt === null,
    );
    await ctx.http
      .delete(`/api/terminals/${f.terminalId}/devices/${device.id}`)
      .set('Authorization', `Bearer ${f.hrToken}`)
      .expect(200);
    await identify(
      ctx,
      f.deviceToken,
      payload,
      f.employee.personalNo,
      f.pin,
    ).expect(401);
    expect(await ctx.prisma.terminalBookingGrant.count()).toBe(0);
  });

  it.each(['TERMINAL_PIN_PEPPER', 'TERMINAL_AUDIT_KEY'])(
    'fails PIN operations safely while QR remains available if %s is missing after restart',
    async (key) => {
      const f = await fixture();
      const qrOnly = await terminal(f.hrToken, ['QR']);
      await withConfiguration({ [key]: undefined }, async (instance) => {
        const display = await instance.http
          .get('/api/terminals/kiosk')
          .set('Authorization', `Bearer ${f.deviceToken}`)
          .expect(200);
        expect(display.body.challenge.payload).toMatch(/^ocw1\.n\./);
        await instance.http
          .post(
            `/api/employees/${f.employee.id}/terminal-credentials/pin/reset`,
          )
          .set('Authorization', `Bearer ${f.hrToken}`)
          .send({})
          .expect(503);
        await instance.http
          .put(`/api/terminals/${qrOnly.terminalId}`)
          .set('Authorization', `Bearer ${f.hrToken}`)
          .send({ allowedAuthMethods: ['QR', 'PIN'] })
          .expect(503);
        await instance.http
          .post('/api/terminals/kiosk/challenge')
          .set('Authorization', `Bearer ${f.deviceToken}`)
          .send({})
          .expect(503);
        await instance.http
          .post('/api/terminals/scan')
          .set('Authorization', `Bearer ${f.employeeToken}`)
          .send({
            qrPayload: display.body.challenge.payload,
            action: 'clock-in',
          })
          .expect(201);
      });
      expect(await ctx.prisma.terminalBookingGrant.count()).toBe(0);
      expect(await ctx.prisma.timeEntry.count()).toBe(1);
    },
  );

  it('rejects a PIN pepper reused as the audit key', async () => {
    const f = await fixture();
    await withConfiguration(
      { TERMINAL_PIN_PEPPER: process.env.TERMINAL_AUDIT_KEY },
      async (instance) => {
        await instance.http
          .post(
            `/api/employees/${f.employee.id}/terminal-credentials/pin/reset`,
          )
          .set('Authorization', `Bearer ${f.hrToken}`)
          .send({})
          .expect(503);
        await instance.http
          .post('/api/terminals/kiosk/challenge')
          .set('Authorization', `Bearer ${f.deviceToken}`)
          .send({})
          .expect(503);
        await instance.http
          .get('/api/terminals/kiosk')
          .set('Authorization', `Bearer ${f.deviceToken}`)
          .expect(200);
      },
    );
    expect(await ctx.prisma.terminalBookingGrant.count()).toBe(0);
  });

  it('accepts an old credential only with its retained pepper and resets it using the new key version', async () => {
    const f = await fixture();
    const previousVersion = process.env.TERMINAL_PIN_PEPPER_VERSION ?? '1';
    const previousPepper = process.env.TERMINAL_PIN_PEPPER ?? '';
    const rotatedVersion =
      previousVersion === 'rotated-e2e' ? 'next-e2e' : 'rotated-e2e';
    await withConfiguration(
      {
        TERMINAL_PIN_PEPPER: 'synthetic-rotated-e2e-pepper-distinct-and-long',
        TERMINAL_PIN_PEPPER_VERSION: rotatedVersion,
        TERMINAL_PIN_PREVIOUS_PEPPERS: '{}',
      },
      async (instance) => {
        const payload = await challenge(f.deviceToken, instance);
        await identify(
          instance,
          f.deviceToken,
          payload,
          f.employee.personalNo,
          f.pin,
        ).expect(401);
        process.env.TERMINAL_PIN_PREVIOUS_PEPPERS = JSON.stringify({
          [previousVersion]: previousPepper,
        });
        const oldGrant = await identify(
          instance,
          f.deviceToken,
          payload,
          f.employee.personalNo,
          f.pin,
        ).expect(201);
        const replacement = await instance.http
          .post(
            `/api/employees/${f.employee.id}/terminal-credentials/pin/reset`,
          )
          .set('Authorization', `Bearer ${f.hrToken}`)
          .send({})
          .expect(201);
        const stored = await ctx.prisma.terminalCredential.findUniqueOrThrow({
          where: { employeeId: f.employee.id },
        });
        expect(stored.pepperVersion).toBe(rotatedVersion);
        await instance.http
          .post('/api/terminals/kiosk/book')
          .set('Authorization', `Bearer ${f.deviceToken}`)
          .send({ grant: oldGrant.body.grant, action: 'clock-in' })
          .expect(409);
        await identify(
          instance,
          f.deviceToken,
          payload,
          f.employee.personalNo,
          replacement.body.pin,
        ).expect(201);
        await login(instance.http, f.employee.email);
        expect(await ctx.prisma.timeEntry.count()).toBe(0);
      },
    );
  });
});
