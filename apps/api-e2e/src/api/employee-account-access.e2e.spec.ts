import { JwtService } from '@nestjs/jwt';
import {
  createTestApp,
  login,
  seedEmployee,
  seedLeaveAllowance,
  type TestContext,
} from '../support/test-app';

const YEAR = new Date().getUTCFullYear();
const ABSENCE_DAY = `${YEAR - 1}-05-05`;

async function seedAccessFixture(ctx: TestContext) {
  const hr = await seedEmployee(ctx.prisma, {
    personalNo: 'ACCESS-HR',
    firstName: 'Hannah',
    lastName: 'Human Resources',
    email: 'access.hr@test.local',
    role: 'HRAdmin',
  });
  const manager = await seedEmployee(ctx.prisma, {
    personalNo: 'ACCESS-MANAGER',
    firstName: 'Mara',
    lastName: 'Manager',
    email: 'access.manager@test.local',
    role: 'Manager',
  });
  const employee = await seedEmployee(ctx.prisma, {
    personalNo: 'ACCESS-EMPLOYEE',
    firstName: 'Emil',
    lastName: 'Employee',
    email: 'access.employee@test.local',
    managerId: manager.id,
  });
  const foreign = await seedEmployee(ctx.prisma, {
    personalNo: 'ACCESS-FOREIGN',
    firstName: 'Frida',
    lastName: 'Foreign',
    email: 'access.foreign@test.local',
  });
  const inactive = await seedEmployee(ctx.prisma, {
    personalNo: 'ACCESS-INACTIVE',
    firstName: 'Ida',
    lastName: 'Inactive',
    email: 'access.inactive@test.local',
    managerId: manager.id,
  });
  await ctx.prisma.employee.update({
    where: { id: inactive.id },
    data: { isActive: false },
  });
  const people = { hr, manager, employee, foreign, inactive };
  for (const person of Object.values(people)) {
    await seedLeaveAllowance(
      ctx.prisma,
      person.id,
      YEAR,
      person.id === employee.id ? 17 : person.id === foreign.id ? 23 : 30,
    );
  }
  await ctx.prisma.absence.createMany({
    data: Object.values(people).map((person) => ({
      employeeId: person.id,
      kind: 'Sickness' as const,
      from: new Date(`${ABSENCE_DAY}T00:00:00.000Z`),
      to: new Date(`${ABSENCE_DAY}T00:00:00.000Z`),
      certified: true,
      note: `Synthetic private absence for ${person.personalNo}`,
    })),
  });
  await ctx.prisma.workSchedule.create({
    data: {
      name: 'Access test core window',
      frameStart: '07:00',
      frameEnd: '18:00',
      isDefault: true,
      coreTimes: {
        create: [
          { label: 'Core', start: '10:00', end: '11:00', weekdays: 127 },
        ],
      },
    },
  });
  await ctx.prisma.timeEntry.createMany({
    data: Object.values(people).map((person) => ({
      employeeId: person.id,
      clockIn: new Date(YEAR - 1, 4, 5, 11, 30),
      clockOut: new Date(YEAR - 1, 4, 5, 12, 0),
      status: 'Approved' as const,
    })),
  });
  return people;
}

function recordPaths(employeeId: string) {
  return [
    `/api/employees/${employeeId}`,
    `/api/accounts/${employeeId}`,
    `/api/accounts/${employeeId}/vacation?year=${YEAR}`,
  ];
}

describe('Personal employee data read access', () => {
  let ctx: TestContext;
  let fixture: Awaited<ReturnType<typeof seedAccessFixture>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    fixture = await seedAccessFixture(ctx);
  });

  async function expectRecordAccess(
    token: string,
    employeeId: string,
    status: number,
    query: Record<string, string> = {},
  ) {
    for (const [index, path] of recordPaths(employeeId).entries()) {
      const response = await ctx.http
        .get(path)
        .query(query)
        .set('Authorization', `Bearer ${token}`)
        .expect(status);
      if (status === 200) {
        expect(response.body).toMatchObject(
          index === 0 ? { id: employeeId } : { employeeId },
        );
        expect(response.body).not.toHaveProperty('passwordHash');
      }
    }
    for (const path of [
      `/api/employees/${employeeId}/leave-allowances`,
      '/api/violations',
      '/api/absences',
    ]) {
      const response = await ctx.http
        .get(path)
        .query({
          ...query,
          // On these endpoints employeeId selects the record. Keep the target
          // fixed while testing spoofed actor/role parameters.
          ...(path.startsWith('/api/employees/') ? {} : { employeeId }),
        })
        .set('Authorization', `Bearer ${token}`)
        .expect(status);
      if (status === 200) {
        expect(response.body).toHaveLength(1);
        expect(response.body[0]).toMatchObject({ employeeId });
      }
    }
  }

  async function expectProtectedResourcesReject(token: string) {
    for (const path of [
      '/api/employees',
      '/api/employees/directory',
      ...recordPaths(fixture.employee.id),
      `/api/employees/${fixture.employee.id}/leave-allowances`,
      `/api/violations?employeeId=${fixture.employee.id}`,
      `/api/absences?employeeId=${fixture.employee.id}`,
    ]) {
      await ctx.http
        .get(path)
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    }
  }

  it.each([
    'list',
    'directory',
    'profile',
    'account',
    'vacation',
    'leave allowances',
    'violations',
    'absences',
  ])('rejects anonymous access to the %s endpoint', async (resource) => {
    const paths: Record<string, string> = {
      list: '/api/employees',
      directory: '/api/employees/directory',
      profile: `/api/employees/${fixture.employee.id}`,
      account: `/api/accounts/${fixture.employee.id}`,
      vacation: `/api/accounts/${fixture.employee.id}/vacation?year=${YEAR}`,
      'leave allowances': `/api/employees/${fixture.employee.id}/leave-allowances`,
      violations: `/api/violations?employeeId=${fixture.employee.id}`,
      absences: `/api/absences?employeeId=${fixture.employee.id}`,
    };
    await ctx.http.get(paths[resource]).expect(401);
  });

  it('lists only the authenticated employee, including with spoofed query parameters', async () => {
    const token = await login(ctx.http, fixture.employee.email);
    for (const query of [
      {},
      {
        includeInactive: 'true',
        employeeId: fixture.foreign.id,
        actorId: fixture.hr.id,
        role: 'HRAdmin',
      },
    ]) {
      const response = await ctx.http
        .get('/api/employees')
        .query(query)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.map((entry: { id: string }) => entry.id)).toEqual([
        fixture.employee.id,
      ]);
    }
  });

  it('allows an employee to read their own profile, balances, allowances, violations, and absences', async () => {
    const token = await login(ctx.http, fixture.employee.email);
    await expectRecordAccess(token, fixture.employee.id, 200);
    const vacation = await ctx.http
      .get(`/api/accounts/${fixture.employee.id}/vacation`)
      .query({ year: YEAR, employeeId: fixture.foreign.id })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(vacation.body).toMatchObject({
      employeeId: fixture.employee.id,
      year: YEAR,
      baseDays: 17,
      totalEntitlement: 17,
    });
  });

  it('forbids employees from reading colleagues, managers, HR, or inactive employees', async () => {
    const token = await login(ctx.http, fixture.employee.email);
    for (const target of [
      fixture.foreign,
      fixture.manager,
      fixture.hr,
      fixture.inactive,
    ]) {
      await expectRecordAccess(token, target.id, 403);
    }
  });

  it('does not let query parameters grant employee access to foreign records', async () => {
    const token = await login(ctx.http, fixture.employee.email);
    await expectRecordAccess(token, fixture.foreign.id, 403, {
      employeeId: fixture.employee.id,
      actorId: fixture.hr.id,
      role: 'HRAdmin',
      includeInactive: 'true',
    });
  });

  it('lists only a manager and their direct reports, retaining the active default filter', async () => {
    const token = await login(ctx.http, fixture.manager.email);
    for (const includeInactive of [false, true]) {
      const response = await ctx.http
        .get('/api/employees')
        .query(includeInactive ? { includeInactive: 'true' } : {})
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const expectedIds = [fixture.manager.id, fixture.employee.id];
      if (includeInactive) expectedIds.push(fixture.inactive.id);
      expect(
        response.body.map((entry: { id: string }) => entry.id).sort(),
      ).toEqual(expectedIds.sort());
    }
  });

  it('allows managers to read themselves and their direct reports', async () => {
    const token = await login(ctx.http, fixture.manager.email);
    for (const target of [
      fixture.manager,
      fixture.employee,
      fixture.inactive,
    ]) {
      await expectRecordAccess(token, target.id, 200);
    }
  });

  it('forbids managers from reading unrelated employees or HR, even with spoofed query parameters', async () => {
    const token = await login(ctx.http, fixture.manager.email);
    for (const target of [fixture.foreign, fixture.hr]) {
      await expectRecordAccess(token, target.id, 403, {
        employeeId: fixture.employee.id,
        actorId: fixture.hr.id,
        role: 'HRAdmin',
      });
    }
  });

  it('allows HR to list all employees while excluding inactive employees by default', async () => {
    const token = await login(ctx.http, fixture.hr.email);
    for (const includeInactive of [false, true]) {
      const response = await ctx.http
        .get('/api/employees')
        .query(includeInactive ? { includeInactive: 'true' } : {})
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const expectedIds = [
        fixture.hr.id,
        fixture.manager.id,
        fixture.employee.id,
        fixture.foreign.id,
      ];
      if (includeInactive) expectedIds.push(fixture.inactive.id);
      expect(
        response.body.map((entry: { id: string }) => entry.id).sort(),
      ).toEqual(expectedIds.sort());
    }
  });

  it('allows HR to read all employee records, including inactive employees', async () => {
    const token = await login(ctx.http, fixture.hr.email);
    for (const target of Object.values(fixture)) {
      await expectRecordAccess(token, target.id, 200);
    }
  });

  it.each(['Employee', 'Manager', 'HRAdmin'] as const)(
    'scopes unfiltered absence lists to the authenticated %s, including with dates and spoofed actor parameters',
    async (role) => {
      const actor =
        role === 'Employee'
          ? fixture.employee
          : role === 'Manager'
            ? fixture.manager
            : fixture.hr;
      const expectedIds =
        role === 'Employee'
          ? [fixture.employee.id]
          : role === 'Manager'
            ? [fixture.manager.id, fixture.employee.id, fixture.inactive.id]
            : Object.values(fixture).map((person) => person.id);
      const token = await login(ctx.http, actor.email);
      for (const query of [
        {},
        {
          from: ABSENCE_DAY,
          to: ABSENCE_DAY,
          actorId: fixture.hr.id,
          role: 'HRAdmin',
          includeInactive: 'true',
        },
      ]) {
        const response = await ctx.http
          .get('/api/absences')
          .query(query)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(
          response.body
            .map((entry: { employeeId: string }) => entry.employeeId)
            .sort(),
        ).toEqual([...expectedIds].sort());
        expect(
          response.body.every(
            (entry: { certified: boolean }) => entry.certified,
          ),
        ).toBe(true);
      }
    },
  );

  it.each([false, true])(
    'exposes only active names and IDs in the directory (includeInactive=%s)',
    async (includeInactive) => {
      const token = await login(ctx.http, fixture.employee.email);
      const response = await ctx.http
        .get('/api/employees/directory')
        .query(includeInactive ? { includeInactive: 'true' } : {})
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const expected = [
        fixture.hr,
        fixture.manager,
        fixture.employee,
        fixture.foreign,
      ].map(({ id, firstName, lastName }) => ({ id, firstName, lastName }));
      expect(response.body).toHaveLength(expected.length);
      expect(response.body).toEqual(expect.arrayContaining(expected));
      for (const entry of response.body) {
        expect(Object.keys(entry).sort()).toEqual([
          'firstName',
          'id',
          'lastName',
        ]);
      }
      await expectRecordAccess(token, fixture.foreign.id, 403);
    },
  );

  it('rejects a JWT whose role claim was altered without a valid signature', async () => {
    const token = await login(ctx.http, fixture.employee.email);
    const [header, payload, signature] = token.split('.');
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...claims, role: 'HRAdmin' }),
    ).toString('base64url');
    await expectProtectedResourcesReject(
      `${header}.${forgedPayload}.${signature}`,
    );
  });

  it('rejects a correctly signed but expired access token', async () => {
    const token = ctx.app.get(JwtService).sign(
      {
        sub: fixture.employee.id,
        email: fixture.employee.email,
        role: fixture.employee.role,
        typ: 'access',
        ver: fixture.employee.authVersion,
      },
      { expiresIn: -1 },
    );
    await expectProtectedResourcesReject(token);
  });

  it('rejects an existing access token immediately after its employee is deactivated', async () => {
    const token = await login(ctx.http, fixture.employee.email);
    await ctx.prisma.employee.update({
      where: { id: fixture.employee.id },
      data: { isActive: false },
    });
    await expectProtectedResourcesReject(token);
  });

  it('uses the current database role instead of stale HR claims in an access token', async () => {
    const token = await login(ctx.http, fixture.hr.email);
    await ctx.prisma.employee.update({
      where: { id: fixture.hr.id },
      data: { role: 'Employee' },
    });
    const response = await ctx.http
      .get('/api/employees')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.map((entry: { id: string }) => entry.id)).toEqual([
      fixture.hr.id,
    ]);
    await expectRecordAccess(token, fixture.foreign.id, 403);
  });
});
