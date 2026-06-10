import { createTestApp, seedEmployee, seedProject, type TestContext } from '../support/test-app';

describe('ERP export — API-key auth + time-entry list', () => {
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

  it('rejects requests without an API key', async () => {
    await ctx.http.get('/api/erp/timeentries').expect(401);
  });

  it('rejects requests with the wrong API key', async () => {
    await ctx.http
      .get('/api/erp/timeentries')
      .set('X-Api-Key', 'definitely-not-the-key')
      .expect(401);
  });

  it('returns the approved time-entry export with the right API key', async () => {
    const e = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Erp',
      lastName: 'Subject',
      email: 'erp@test.local',
    });
    const today = new Date();
    const clockIn = new Date(today.getTime() - 60 * 60 * 1000);
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: e.id,
        clockIn,
        clockOut: today,
        status: 'Approved',
      },
    });

    const res = await ctx.http
      .get('/api/erp/timeentries')
      .set('X-Api-Key', 'e2e-erp-key')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].employeeId).toBe(e.id);
    expect(res.body[0].personalNo).toBe('1001');
    expect(typeof res.body[0].netMinutes).toBe('number');
  });

  it('exports the project reference when booked, null otherwise', async () => {
    const e = await seedEmployee(ctx.prisma, {
      personalNo: '1003',
      firstName: 'Project',
      lastName: 'Booker',
      email: 'project@test.local',
    });
    const project = await seedProject(ctx.prisma, {
      code: 'PRJ-001',
      name: 'Website Relaunch',
      assigneeIds: [e.id],
    });
    const mk = (hoursAgo: number, projectId?: string) =>
      ctx.prisma.timeEntry.create({
        data: {
          employeeId: e.id,
          clockIn: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
          clockOut: new Date(Date.now() - (hoursAgo - 1) * 60 * 60 * 1000),
          status: 'Approved',
          projectId: projectId ?? null,
        },
      });
    await mk(4, project.id);
    await mk(2);

    const res = await ctx.http
      .get('/api/erp/timeentries')
      .set('X-Api-Key', 'e2e-erp-key')
      .expect(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].projectCode).toBe('PRJ-001');
    expect(res.body[0].projectName).toBe('Website Relaunch');
    expect(res.body[1].projectCode).toBeNull();
    expect(res.body[1].projectName).toBeNull();
  });

  it('only Approved entries are exported — Pending/Open are filtered out', async () => {
    const e = await seedEmployee(ctx.prisma, {
      personalNo: '1002',
      firstName: 'Pending',
      lastName: 'Only',
      email: 'pending@test.local',
    });
    const start = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const end = new Date(Date.now() - 1 * 60 * 60 * 1000);
    await ctx.prisma.timeEntry.create({
      data: { employeeId: e.id, clockIn: start, clockOut: end, status: 'Pending' },
    });
    const res = await ctx.http
      .get('/api/erp/timeentries')
      .set('X-Api-Key', 'e2e-erp-key')
      .expect(200);
    expect(res.body.length).toBe(0);
  });
});
