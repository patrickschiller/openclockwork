import {
  createTestApp,
  login,
  seedEmployee,
  seedLeaveAllowance,
  type TestContext,
} from '../support/test-app';

const YEAR = new Date().getUTCFullYear();

describe('Vacation — Halbtage', () => {
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

  async function setup() {
    const manager = await seedEmployee(ctx.prisma, {
      personalNo: '9000',
      firstName: 'Max',
      lastName: 'Manager',
      email: 'max@test.local',
      role: 'Manager',
    });
    const e = await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
      managerId: manager.id,
    });
    await seedLeaveAllowance(ctx.prisma, e.id, YEAR, 30);
    const token = await login(ctx.http, 'hannah@test.local');
    return { e, manager, token };
  }

  it('halfDayStart on a Mon–Fri range yields 4.5 calculatedDays', async () => {
    const { e, token } = await setup();
    // Mon 2026-05-04 to Fri 2026-05-08, no NRW holidays in that range.
    const res = await ctx.http
      .post('/api/requests/vacation')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId: e.id,
        from: '2026-05-04T00:00:00.000Z',
        to: '2026-05-08T00:00:00.000Z',
        halfDayStart: true,
      })
      .expect(201);
    expect(res.body.calculatedDays).toBe(4.5);
    expect(res.body.halfDayStart).toBe(true);
    expect(res.body.halfDayEnd).toBe(false);
  });

  it('single day with halfDayStart yields 0.5', async () => {
    const { e, token } = await setup();
    const res = await ctx.http
      .post('/api/requests/vacation')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId: e.id,
        from: '2026-05-04T00:00:00.000Z',
        to: '2026-05-04T00:00:00.000Z',
        halfDayStart: true,
      })
      .expect(201);
    expect(res.body.calculatedDays).toBe(0.5);
  });

  it('both halves on a multi-day range yields baseline - 1', async () => {
    const { e, token } = await setup();
    const res = await ctx.http
      .post('/api/requests/vacation')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId: e.id,
        from: '2026-05-04T00:00:00.000Z',
        to: '2026-05-08T00:00:00.000Z',
        halfDayStart: true,
        halfDayEnd: true,
      })
      .expect(201);
    expect(res.body.calculatedDays).toBe(4);
  });

  it('half-days are persisted on the request DTO', async () => {
    const { e, token } = await setup();
    const res = await ctx.http
      .post('/api/requests/vacation')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId: e.id,
        from: '2026-05-04T00:00:00.000Z',
        to: '2026-05-08T00:00:00.000Z',
        halfDayEnd: true,
      })
      .expect(201);
    const reread = await ctx.http
      .get(`/api/requests/${res.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(reread.body.halfDayStart).toBe(false);
    expect(reread.body.halfDayEnd).toBe(true);
    expect(reread.body.calculatedDays).toBe(4.5);
  });
});
