import { ContractPeriodsService } from '../../../api/src/app/employees/contract-periods.service';
import type { ConfirmContractPeriodDto } from '../../../api/src/app/employees/contract-periods.dto';
import { JwtService } from '@nestjs/jwt';
import {
  createTestApp,
  login,
  seedEmployee,
  type TestContext,
} from '../support/test-app';

const facts = {
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  employmentStart: '2020-01-01',
  employmentEnd: null,
  weeklyHours: 40,
  timeModel: 'Vollzeit',
  workingDays: 31,
  holidayCalendar: 'NONE',
  holidayDates: ['2026-05-04'],
  scheduleLabel: 'Synthetic Mon–Fri',
  confirmationNote: 'Synthetic known contract, confirmed by HR',
  confirmed: true,
};
describe('HR-confirmed contract history (#45)', () => {
  let ctx: TestContext;
  let hr: Awaited<ReturnType<typeof seedEmployee>>;
  let employee: Awaited<ReturnType<typeof seedEmployee>>;
  let manager: Awaited<ReturnType<typeof seedEmployee>>;
  let hrToken: string;
  const path = () => `/api/employees/${employee.id}/contract-periods`;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    hr = await seedEmployee(ctx.prisma, {
      personalNo: 'CON-HR',
      firstName: 'Hanna',
      lastName: 'HR',
      email: 'contract.hr@test.local',
      role: 'HRAdmin',
    });
    manager = await seedEmployee(ctx.prisma, {
      personalNo: 'CON-M',
      firstName: 'Marc',
      lastName: 'Manager',
      email: 'contract.manager@test.local',
      role: 'Manager',
    });
    employee = await seedEmployee(ctx.prisma, {
      personalNo: 'CON-E',
      firstName: 'Emil',
      lastName: 'Employee',
      email: 'contract.employee@test.local',
      managerId: manager.id,
    });
    hrToken = await login(ctx.http, hr.email);
  });
  const post = (token: string, body: object) =>
    ctx.http.post(path()).set('Authorization', `Bearer ${token}`).send(body);
  it('does not invent history from legacy mutable profile values', async () => {
    const response = await ctx.http
      .get(path())
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    expect(response.body).toEqual([]);
    expect(await ctx.prisma.employeeContractPeriodAudit.count()).toBe(0);
  });
  it('confirms self-contained dated facts and records authoritative HR actor', async () => {
    const response = await post(hrToken, {
      ...facts,
      confirmedById: employee.id,
      employeeId: manager.id,
    }).expect(201);
    const persistedFacts = Object.fromEntries(
      Object.entries(facts).filter(([key]) => key !== 'confirmed'),
    );
    expect(response.body).toMatchObject({
      ...persistedFacts,
      employeeId: employee.id,
      confirmedById: hr.id,
      revision: 0,
      weeklyHours: 40,
    });
    expect(response.body.confirmed).toBeUndefined();
    const audit =
      await ctx.prisma.employeeContractPeriodAudit.findFirstOrThrow();
    expect(audit).toMatchObject({
      actorId: hr.id,
      action: 'Confirmed',
      before: null,
      after: { id: response.body.id, employeeId: employee.id, weeklyHours: 40 },
    });
    expect(audit.occurredAt).toBeInstanceOf(Date);
  });
  it.each(['manager', 'employee'] as const)(
    'denies %s reading or confirming contracts',
    async (role) => {
      const actor = role === 'manager' ? manager : employee;
      const token = await login(ctx.http, actor.email);
      await ctx.http
        .get(path())
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await post(token, facts).expect(403);
      expect(await ctx.prisma.employeeContractPeriod.count()).toBe(0);
    },
  );
  it('denies a forged/stale HR claim after the actor role changed', async () => {
    const forged = ctx.app.get(JwtService).sign({
      sub: manager.id,
      role: 'HRAdmin',
      email: manager.email,
      authVersion: manager.authVersion,
    });
    await post(forged, facts).expect(403);
    await ctx.prisma.employee.update({
      where: { id: hr.id },
      data: { role: 'Employee' },
    });
    await post(hrToken, facts).expect(403);
  });
  it.each(['revoked', 'demoted', 'inactive', 'Solo'] as const)(
    'revalidates in-flight handler authority after %s state changed',
    async (change) => {
      const service = ctx.app.get(ContractPeriodsService);
      const identity = {
        id: hr.id,
        email: hr.email,
        role: 'HRAdmin' as const,
        authVersion: 0,
      };
      if (change === 'Solo') {
        await ctx.prisma.installationSettings.create({
          data: {
            id: 1,
            mode: 'Solo',
            ownerEmployeeId: hr.id,
            setupCompleted: true,
          },
        });
      } else {
        await ctx.prisma.employee.update({
          where: { id: hr.id },
          data:
            change === 'revoked'
              ? { authVersion: 1 }
              : change === 'demoted'
                ? { role: 'Employee' }
                : { isActive: false },
        });
      }
      await expect(
        service.confirm(
          employee.id,
          facts as ConfirmContractPeriodDto,
          identity,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(service.list(employee.id, identity)).rejects.toMatchObject({
        status: 403,
      });
      expect(await ctx.prisma.employeeContractPeriod.count()).toBe(0);
      expect(await ctx.prisma.employeeContractPeriodAudit.count()).toBe(0);
    },
  );
  it.each([
    { confirmed: false },
    { confirmed: 'true' },
    { confirmationNote: '     ' },
    { effectiveFrom: '2026-02-30' },
    { effectiveTo: '2025-12-31' },
    { employmentEnd: '2019-12-31' },
    { holidayDates: ['2026-02-30'] },
    { workingDays: 0 },
    { workingDays: 128 },
    { weeklyHours: -1 },
    { weeklyHours: 169 },
    { weeklyHours: 40.001 },
    { workingDays: 1, weeklyHours: 25 },
    { holidayCalendar: 'FAKE' },
    { expectedRevision: 0 },
    { supersedesPeriodId: '00000000-0000-4000-8000-000000000999' },
  ])('rejects invalid confirmation %j', async (patch) => {
    await post(hrToken, { ...facts, ...patch }).expect(400);
    expect(await ctx.prisma.employeeContractPeriod.count()).toBe(0);
  });
  it('supports zero-hour contracts and explicit employment boundaries without mutating the profile', async () => {
    const response = await post(hrToken, {
      ...facts,
      weeklyHours: 0,
      workingDays: 0,
      effectiveTo: '2026-12-31',
      employmentStart: '2026-03-01',
      employmentEnd: '2026-10-31',
    }).expect(201);
    expect(response.body).toMatchObject({
      weeklyHours: 0,
      workingDays: 0,
      employmentStart: '2026-03-01',
      employmentEnd: '2026-10-31',
    });
    expect(
      (
        await ctx.prisma.employee.findUniqueOrThrow({
          where: { id: employee.id },
        })
      ).weeklyHours.toNumber(),
    ).toBe(40);
  });
  it('rejects overlap including inclusive boundaries, without changing either period or audit', async () => {
    await post(hrToken, { ...facts, effectiveTo: '2026-06-30' }).expect(201);
    await post(hrToken, { ...facts, effectiveFrom: '2026-06-30' }).expect(409);
    await post(hrToken, facts).expect(409);
    expect(await ctx.prisma.employeeContractPeriod.count()).toBe(1);
    expect(await ctx.prisma.employeeContractPeriodAudit.count()).toBe(1);
    await post(hrToken, { ...facts, effectiveFrom: '2026-07-01' }).expect(201);
  });
  it('explicitly supersedes only the covering period with revision and before/after audit', async () => {
    const old = (await post(hrToken, facts).expect(201)).body;
    const next = await post(hrToken, {
      ...facts,
      effectiveFrom: '2026-07-01',
      weeklyHours: 20,
      timeModel: 'Teilzeit',
      supersedesPeriodId: old.id,
      expectedRevision: 0,
    }).expect(201);
    const previous = await ctx.prisma.employeeContractPeriod.findUniqueOrThrow({
      where: { id: old.id },
    });
    expect(previous.effectiveTo?.toISOString()).toBe(
      '2026-06-30T00:00:00.000Z',
    );
    expect(previous.weeklyHours.toNumber()).toBe(40);
    expect(previous.revision).toBe(1);
    expect(next.body).toMatchObject({
      weeklyHours: 20,
      revision: 0,
      confirmedById: hr.id,
    });
    const audits = await ctx.prisma.employeeContractPeriodAudit.findMany({
      where: { periodId: old.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(audits).toHaveLength(2);
    expect(audits[1]).toMatchObject({
      action: 'Superseded',
      actorId: hr.id,
      before: { effectiveTo: null, weeklyHours: 40, revision: 0 },
      after: { effectiveTo: '2026-06-30', weeklyHours: 40, revision: 1 },
    });
    await post(hrToken, {
      ...facts,
      effectiveFrom: '2026-08-01',
      supersedesPeriodId: old.id,
      expectedRevision: 0,
    }).expect(409);
    expect(await ctx.prisma.employeeContractPeriod.count()).toBe(2);
  });
  it('does not use a foreign employee contract as a supersession token', async () => {
    const foreign = (
      await ctx.http
        .post(`/api/employees/${manager.id}/contract-periods`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send(facts)
        .expect(201)
    ).body;
    await post(hrToken, {
      ...facts,
      effectiveFrom: '2026-07-01',
      supersedesPeriodId: foreign.id,
      expectedRevision: 0,
    }).expect(409);
    expect(
      await ctx.prisma.employeeContractPeriod.count({
        where: { employeeId: employee.id },
      }),
    ).toBe(0);
  });
  it('rolls back supersession when the proposed period overlaps another known period', async () => {
    const old = (
      await post(hrToken, { ...facts, effectiveTo: '2026-06-30' }).expect(201)
    ).body;
    await post(hrToken, { ...facts, effectiveFrom: '2026-09-01' }).expect(201);
    await post(hrToken, {
      ...facts,
      effectiveFrom: '2026-05-01',
      supersedesPeriodId: old.id,
      expectedRevision: 0,
    }).expect(409);
    expect(
      (
        await ctx.prisma.employeeContractPeriod.findUniqueOrThrow({
          where: { id: old.id },
        })
      ).revision,
    ).toBe(0);
    expect(await ctx.prisma.employeeContractPeriodAudit.count()).toBe(2);
  });
  it('serializes competing confirmations and stale supersessions across concurrent requests', async () => {
    const competing = await Promise.all([
      post(hrToken, facts),
      post(hrToken, { ...facts, weeklyHours: 20 }),
    ]);
    expect(competing.map((r) => r.status).sort()).toEqual([201, 409]);
    const old = competing.find((r) => r.status === 201)?.body;
    const competingChanges = await Promise.all(
      [20, 30].map((weeklyHours) =>
        post(hrToken, {
          ...facts,
          effectiveFrom: '2026-07-01',
          weeklyHours,
          supersedesPeriodId: old.id,
          expectedRevision: 0,
        }),
      ),
    );
    expect(competingChanges.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await ctx.prisma.employeeContractPeriod.count()).toBe(2);
    expect(await ctx.prisma.employeeContractPeriodAudit.count()).toBe(3);
  });
  it('rolls back both period boundaries and facts if audit persistence fails', async () => {
    const old = (await post(hrToken, facts).expect(201)).body;
    await ctx.prisma
      .$executeRawUnsafe(`CREATE FUNCTION "test45FailContractAudit"() RETURNS trigger AS $$
      BEGIN
        IF NEW."action" = 'Confirmed' AND NEW."after"->>'weeklyHours' = '13' THEN
          RAISE EXCEPTION 'Synthetic audit storage failure';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    try {
      await ctx.prisma.$executeRawUnsafe(
        `CREATE TRIGGER "test45FailContractAudit" BEFORE INSERT ON "EmployeeContractPeriodAudit" FOR EACH ROW EXECUTE FUNCTION "test45FailContractAudit"()`,
      );
      await post(hrToken, {
        ...facts,
        effectiveFrom: '2026-07-01',
        weeklyHours: 13,
        supersedesPeriodId: old.id,
        expectedRevision: 0,
      }).expect(500);
      const retained =
        await ctx.prisma.employeeContractPeriod.findUniqueOrThrow({
          where: { id: old.id },
        });
      expect(retained).toMatchObject({ effectiveTo: null, revision: 0 });
      expect(retained.weeklyHours.toNumber()).toBe(40);
      expect(await ctx.prisma.employeeContractPeriod.count()).toBe(1);
      expect(await ctx.prisma.employeeContractPeriodAudit.count()).toBe(1);
    } finally {
      await ctx.prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "test45FailContractAudit" ON "EmployeeContractPeriodAudit"`,
      );
      await ctx.prisma.$executeRawUnsafe(
        `DROP FUNCTION "test45FailContractAudit"()`,
      );
    }
  });
  it('retains immutable schedule and contract facts after operational profile/schedule updates', async () => {
    const schedule = await ctx.prisma.workSchedule.create({
      data: {
        name: 'Mutable schedule',
        frameStart: '07:00',
        frameEnd: '18:00',
        workingDays: 31,
      },
    });
    const saved = (await post(hrToken, facts).expect(201)).body;
    await ctx.prisma.employee.update({
      where: { id: employee.id },
      data: {
        weeklyHours: 12,
        timeModel: 'Teilzeit',
        startDate: new Date('2026-09-01'),
        workScheduleId: schedule.id,
        holidayCalendar: 'DE-BY',
        holidayDates: ['2026-05-05'],
      },
    });
    await ctx.prisma.workSchedule.update({
      where: { id: schedule.id },
      data: { workingDays: 15, name: 'Now a different schedule' },
    });
    const response = await ctx.http
      .get(path())
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    expect(response.body).toEqual([saved]);
  });
});
