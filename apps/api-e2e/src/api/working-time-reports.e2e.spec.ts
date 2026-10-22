import { randomUUID } from 'node:crypto';
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

  it('filters the JSON report to an explicit subset of employees', async () => {
    const { hr, manager, report, foreign } = await fixture();
    const token = await login(ctx.http, hr.email);
    await ctx.prisma.timeEntry.createMany({
      data: [manager, report, foreign].map((employee) => ({
        employeeId: employee.id,
        clockIn: new Date('2026-08-10T07:00:00.000Z'),
        clockOut: new Date('2026-08-10T08:00:00.000Z'),
        status: 'Approved',
      })),
    });

    const selected = await ctx.http
      .get(
        `/api/reports/working-times?from=2026-08-01&to=2026-08-31&employeeIds=${report.id}&employeeIds=${foreign.id}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(selected.body.rows).toHaveLength(2);
    expect(
      new Set(
        selected.body.rows.map((row: { employeeId: string }) => row.employeeId),
      ),
    ).toEqual(new Set([report.id, foreign.id]));
    expect(selected.body.totals).toEqual({
      grossMinutes: 120,
      breakMinutes: 0,
      netMinutes: 120,
    });

    const one = await ctx.http
      .get(
        `/api/reports/working-times?from=2026-08-01&to=2026-08-31&employeeIds=${report.id}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(one.body.rows).toHaveLength(1);
    expect(one.body.rows[0].employeeId).toBe(report.id);
  });

  it('retains seconds in ungrouped report durations and preserves captured breaks', async () => {
    const { hr, report } = await fixture();
    const token = await login(ctx.http, hr.email);
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: report.id,
        clockIn: new Date('2026-08-10T07:00:01.000Z'),
        clockOut: new Date('2026-08-10T15:00:59.000Z'),
        breakRules: [{ afterMinutes: 360, breakMinutes: 30 }],
        status: 'Approved',
      },
    });

    const result = await ctx.http
      .get(
        `/api/reports/working-times?from=2026-08-10&to=2026-08-10&employeeId=${report.id}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(result.body.rows).toHaveLength(1);
    expect(result.body.rows[0]).toMatchObject({
      clockIn: '2026-08-10T07:00:01.000Z',
      clockOut: '2026-08-10T15:00:59.000Z',
      breakMinutes: 30,
    });
    expect(result.body.rows[0].grossMinutes).toBeCloseTo(480 + 58 / 60, 8);
    expect(result.body.rows[0].netMinutes).toBeCloseTo(450 + 58 / 60, 8);
    expect(result.body.totals.grossMinutes).toBeCloseTo(480 + 58 / 60, 8);
    expect(result.body.totals.breakMinutes).toBe(30);
    expect(result.body.totals.netMinutes).toBeCloseTo(450 + 58 / 60, 8);
  });

  it('preserves capture-group break allocation when a sibling falls outside the selected dates', async () => {
    const { hr, report } = await fixture();
    const token = await login(ctx.http, hr.email);
    const common = {
      employeeId: report.id,
      captureGroupId: randomUUID(),
      breakRules: [{ afterMinutes: 360, breakMinutes: 30 }],
      status: 'Approved' as const,
    };
    await ctx.prisma.timeEntry.createMany({
      data: [
        {
          ...common,
          clockIn: new Date('2026-08-10T18:00:00.000Z'),
          clockOut: new Date('2026-08-10T22:00:00.000Z'),
        },
        {
          ...common,
          clockIn: new Date('2026-08-11T06:00:00.000Z'),
          clockOut: new Date('2026-08-11T10:00:00.000Z'),
        },
        {
          ...common,
          clockIn: new Date('2026-08-12T06:00:00.000Z'),
          clockOut: new Date('2026-08-12T10:00:00.000Z'),
          status: 'Rejected',
        },
        {
          ...common,
          clockIn: new Date('2026-08-13T06:00:00.000Z'),
          clockOut: new Date('2026-08-13T10:00:00.000Z'),
          voidedAt: new Date(),
        },
      ],
    });

    for (const to of ['2026-08-10', '2026-08-11']) {
      const result = await ctx.http
        .get(
          `/api/reports/working-times?from=2026-08-10&to=${to}&employeeId=${report.id}`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const count = to === '2026-08-10' ? 1 : 2;
      expect(result.body.rows).toHaveLength(count);
      for (const row of result.body.rows) {
        expect(row).toMatchObject({
          grossMinutes: 240,
          breakMinutes: 15,
          netMinutes: 225,
        });
      }
      expect(result.body.totals).toEqual({
        grossMinutes: 240 * count,
        breakMinutes: 15 * count,
        netMinutes: 225 * count,
      });
    }
  });

  it('downloads PDF attachments for single, selected and all employees in both languages', async () => {
    const { hr, manager, report, foreign } = await fixture();
    const token = await login(ctx.http, hr.email);
    await ctx.prisma.employee.update({
      where: { id: foreign.id },
      data: { isActive: false },
    });
    await ctx.prisma.timeEntry.createMany({
      data: [
        {
          employeeId: report.id,
          clockIn: new Date('2026-08-10T07:00:00.000Z'),
          clockOut: new Date('2026-08-10T15:00:00.000Z'),
          breakRules: [{ afterMinutes: 360, breakMinutes: 30 }],
          status: 'Approved',
          note: 'Private note not intended for a working-time PDF',
          terminalLocationLabel: 'Private location',
        },
        {
          employeeId: foreign.id,
          clockIn: new Date('2026-08-10T07:00:00.000Z'),
          clockOut: new Date('2026-08-10T08:00:00.000Z'),
          status: 'Pending',
        },
        {
          employeeId: report.id,
          clockIn: new Date('2026-08-11T07:00:00.000Z'),
          clockOut: null,
          status: 'Open',
        },
      ],
    });

    for (const filter of [
      `&employeeId=${report.id}`,
      `&employeeIds=${report.id}&employeeIds=${foreign.id}&locale=en`,
      `&employeeIds=${foreign.id}&locale=de`,
      `&employeeId=${manager.id}`,
      '',
    ]) {
      const result = await ctx.http
        .get(
          `/api/reports/working-times.pdf?from=2026-08-01&to=2026-08-31${filter}`,
        )
        .set('Authorization', `Bearer ${token}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
          res.on('error', callback);
        })
        .expect(200);
      expect(result.headers['content-type']).toContain('application/pdf');
      expect(result.headers['content-disposition']).toBe(
        'attachment; filename="openclockwork-working-times-2026-08-01-2026-08-31.pdf"',
      );
      expect(result.headers['cache-control']).toContain('no-store');
      expect(result.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.isBuffer(result.body)).toBe(true);
      expect((result.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      expect((result.body as Buffer).subarray(-20).toString()).toContain(
        '%%EOF',
      );
    }
  });

  it('restricts PDF downloads to authenticated HR administrators', async () => {
    const { manager, report } = await fixture();
    const url = '/api/reports/working-times.pdf?from=2026-08-01&to=2026-08-31';
    await ctx.http.get(url).expect(401);
    for (const employee of [manager, report]) {
      const token = await login(ctx.http, employee.email);
      await ctx.http
        .get(url)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    }
  });

  it('validates PDF date ranges, employee selections and locale', async () => {
    const { hr, report, foreign } = await fixture();
    const token = await login(ctx.http, hr.email);
    const validDates = 'from=2026-08-01&to=2026-08-31';
    const invalidQueries = [
      'from=2026-02-31&to=2026-03-01',
      'from=2026-08-31&to=2026-08-01',
      'from=2025-01-01&to=2026-12-31',
      'to=2026-08-31',
      `${validDates}&employeeId=invalid`,
      `${validDates}&employeeIds=${report.id}&employeeIds=invalid`,
      `${validDates}&employeeId=${report.id}&employeeIds=${foreign.id}`,
      `${validDates}&employeeIds=${report.id}&employeeIds=${report.id}`,
      `${validDates}&employeeIds=${randomUUID()}`,
      `${validDates}&locale=fr`,
    ];
    for (const query of invalidQueries) {
      await ctx.http
        .get(`/api/reports/working-times.pdf?${query}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    }

    for (const filter of [
      `employeeId=${report.id}&employeeIds=${foreign.id}`,
      `employeeIds=${report.id}&employeeIds=invalid`,
    ]) {
      await ctx.http
        .get(`/api/reports/working-times?${validDates}&${filter}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    }
  });
});
