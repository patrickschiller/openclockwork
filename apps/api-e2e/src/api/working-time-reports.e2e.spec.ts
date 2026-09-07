import {
  createTestApp,
  login,
  seedEmployee,
  seedProject,
  type TestContext,
} from '../support/test-app';

describe('Project-independent working-time reports', () => {
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
      personalNo: '9001',
      firstName: 'Hannah',
      lastName: 'HR',
      email: 'hannah.hr@test.local',
      role: 'HRAdmin',
    });
    const manager = await seedEmployee(ctx.prisma, {
      personalNo: '9002',
      firstName: 'Mara',
      lastName: 'Manager',
      email: 'mara.manager@test.local',
      role: 'Manager',
    });
    const report = await seedEmployee(ctx.prisma, {
      personalNo: '9003',
      firstName: 'Dora',
      lastName: 'Direct',
      email: 'dora.direct@test.local',
      managerId: manager.id,
    });
    const foreign = await seedEmployee(ctx.prisma, {
      personalNo: '9004',
      firstName: 'Frank',
      lastName: 'Foreign',
      email: 'frank.foreign@test.local',
    });
    return { hr, manager, report, foreign };
  }

  it('reports closed non-rejected entries regardless of project assignment', async () => {
    const { hr, manager, report, foreign } = await fixture();
    const hrToken = await login(ctx.http, hr.email);
    const managerToken = await login(ctx.http, manager.email);
    const project = await seedProject(ctx.prisma, {
      code: 'REPORT-PROJECT',
      assigneeIds: [report.id],
    });
    await ctx.prisma.timeEntry.createMany({
      data: [
        {
          employeeId: report.id,
          projectId: project.id,
          clockIn: new Date('2026-08-10T07:00:00.000Z'),
          clockOut: new Date('2026-08-10T15:00:00.000Z'),
          breakRules: [
            { afterMinutes: 360, breakMinutes: 30 },
            { afterMinutes: 540, breakMinutes: 45 },
          ],
          status: 'Approved',
          terminalLocationLabel: 'Büro Würzburg',
          latitude: 49.791304,
          longitude: 9.953355,
          accuracyMeters: 12,
          clockOutLatitude: 49.8,
          clockOutLongitude: 9.94,
          clockOutAccuracyMeters: 18.4,
        },
        {
          employeeId: manager.id,
          clockIn: new Date('2026-08-10T08:00:00.000Z'),
          clockOut: new Date('2026-08-10T09:00:00.000Z'),
          status: 'Pending',
        },
        {
          employeeId: foreign.id,
          clockIn: new Date('2026-08-10T09:00:00.000Z'),
          clockOut: new Date('2026-08-10T11:00:00.000Z'),
          status: 'Approved',
        },
        {
          employeeId: report.id,
          clockIn: new Date('2026-08-11T07:00:00.000Z'),
          clockOut: new Date('2026-08-11T08:00:00.000Z'),
          status: 'Rejected',
        },
        {
          employeeId: report.id,
          clockIn: new Date('2026-08-12T07:00:00.000Z'),
          clockOut: null,
          status: 'Open',
        },
      ],
    });

    const hrEmployees = await ctx.http
      .get('/api/reports/working-times/employees')
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    expect(hrEmployees.body).toHaveLength(4);

    const hrReport = await ctx.http
      .get('/api/reports/working-times?from=2026-08-01&to=2026-08-31')
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    expect(hrReport.body.rows).toHaveLength(3);
    expect(hrReport.body.rows[0]).not.toHaveProperty('clockInLocation');
    expect(hrReport.body.rows[0]).not.toHaveProperty('clockOutLocation');
    expect(hrReport.body.totals).toEqual({
      grossMinutes: 660,
      breakMinutes: 30,
      netMinutes: 630,
    });

    const reportWithLocations = await ctx.http
      .get(
        '/api/reports/working-times?from=2026-08-01&to=2026-08-31&includeLocations=true',
      )
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    expect(reportWithLocations.body.rows[0]).toMatchObject({
      clockInLocation: {
        label: 'Büro Würzburg',
        latitude: 49.791304,
        longitude: 9.953355,
        accuracyMeters: 12,
      },
      clockOutLocation: {
        label: null,
        latitude: 49.8,
        longitude: 9.94,
        accuracyMeters: 18.4,
      },
    });
    expect(reportWithLocations.body.rows[1].clockInLocation).toBeNull();
    expect(reportWithLocations.body.rows[1].clockOutLocation).toBeNull();

    const onlyDirect = await ctx.http
      .get(
        `/api/reports/working-times?from=2026-08-01&to=2026-08-31&employeeId=${report.id}`,
      )
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    expect(onlyDirect.body.rows).toHaveLength(1);
    expect(onlyDirect.body.rows[0].employeeId).toBe(report.id);

    await ctx.http
      .get('/api/reports/working-times/employees')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(403);
    await ctx.http
      .get('/api/reports/working-times?from=2026-08-01&to=2026-08-31')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(403);
  });

  it('validates calendar dates, ordering, range length and roles', async () => {
    const { hr, report } = await fixture();
    const hrToken = await login(ctx.http, hr.email);
    const employeeToken = await login(ctx.http, report.email);
    await ctx.http
      .get('/api/reports/working-times?from=2026-02-31&to=2026-03-01')
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(400);
    await ctx.http
      .get('/api/reports/working-times?from=2026-08-31&to=2026-08-01')
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(400);
    await ctx.http
      .get('/api/reports/working-times?from=2025-01-01&to=2026-12-31')
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(400);
    await ctx.http
      .get(
        '/api/reports/working-times?from=2026-08-01&to=2026-08-31&includeLocations=yes',
      )
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(400);
    await ctx.http
      .get('/api/reports/working-times?from=2026-08-01&to=2026-08-31')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
  });
});
