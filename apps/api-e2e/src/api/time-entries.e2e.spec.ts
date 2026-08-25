import {
  createTestApp,
  login,
  seedEmployee,
  type TestContext,
} from '../support/test-app';

describe('TimeEntries — clock-in / clock-out lifecycle', () => {
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
    const e = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Test',
      lastName: 'Subject',
      email: 'sub@test.local',
    });
    return e;
  }

  it('clock-in creates an open entry; list returns it', async () => {
    const e = await fixture();
    const token = await login(ctx.http, e.email);
    const created = await ctx.http
      .post('/api/timeentries/clock-in')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId: e.id })
      .expect(201);
    expect(created.body.clockOut).toBeNull();
    expect(created.body.status).toBe('Open');

    const list = await ctx.http
      .get(`/api/timeentries?employeeId=${e.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.length).toBe(1);
    expect(list.body[0].id).toBe(created.body.id);
  });

  it('double clock-in without a clock-out is rejected with 409', async () => {
    const e = await fixture();
    const token = await login(ctx.http, e.email);
    await ctx.http
      .post('/api/timeentries/clock-in')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId: e.id })
      .expect(201);
    await ctx.http
      .post('/api/timeentries/clock-in')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId: e.id })
      .expect(409);
  });

  it('clock-out closes the open entry and computes a summary', async () => {
    const e = await fixture();
    const token = await login(ctx.http, e.email);
    // Hand-craft an entry from earlier so clock-out has a positive duration
    // without the test having to wait a real second.
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    await ctx.prisma.timeEntry.create({
      data: {
        employeeId: e.id,
        clockIn: tenMinAgo,
        status: 'Open',
        source: 'Pwa',
      },
    });
    const closed = await ctx.http
      .post('/api/timeentries/clock-out')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId: e.id })
      .expect(201);
    expect(closed.body.clockOut).not.toBeNull();
    expect(['Approved', 'Pending']).toContain(closed.body.status);
  });

  it('clock-out without an open entry returns 404', async () => {
    const e = await fixture();
    const token = await login(ctx.http, e.email);
    await ctx.http
      .post('/api/timeentries/clock-out')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId: e.id })
      .expect(404);
  });

  it('list respects the from/to date window', async () => {
    const e = await fixture();
    const token = await login(ctx.http, e.email);
    const old = new Date('2020-01-01T08:00:00Z');
    const oldEnd = new Date('2020-01-01T16:00:00Z');
    const recent = new Date(Date.now() - 60 * 60 * 1000);
    const recentEnd = new Date();
    await ctx.prisma.timeEntry.createMany({
      data: [
        {
          employeeId: e.id,
          clockIn: old,
          clockOut: oldEnd,
          status: 'Approved',
        },
        {
          employeeId: e.id,
          clockIn: recent,
          clockOut: recentEnd,
          status: 'Approved',
        },
      ],
    });
    const all = await ctx.http
      .get(`/api/timeentries?employeeId=${e.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(all.body.length).toBe(2);
    const onlyRecent = await ctx.http
      .get(`/api/timeentries?employeeId=${e.id}&from=2024-01-01T00:00:00.000Z`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(onlyRecent.body.length).toBe(1);
  });

  it('requires auth and ignores a spoofed employeeId in the request body', async () => {
    const owner = await fixture();
    const other = await seedEmployee(ctx.prisma, {
      personalNo: '1002',
      firstName: 'Other',
      lastName: 'Employee',
      email: 'other@test.local',
    });
    await ctx.http
      .post('/api/timeentries/clock-in')
      .send({ employeeId: owner.id })
      .expect(401);

    const token = await login(ctx.http, owner.email);
    const created = await ctx.http
      .post('/api/timeentries/clock-in')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId: other.id })
      .expect(201);
    expect(created.body.employeeId).toBe(owner.id);

    const otherToken = await login(ctx.http, other.email);
    await ctx.http
      .get(`/api/timeentries?employeeId=${owner.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });
});
