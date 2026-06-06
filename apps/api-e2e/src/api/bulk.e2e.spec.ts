import {
  createTestApp,
  login,
  seedEmployee,
  seedLeaveAllowance,
  type TestContext,
} from '../support/test-app';

const YEAR = new Date().getUTCFullYear();

describe('Bulk approve — POST /api/requests/bulk-approve', () => {
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

  it('approves a batch and returns one error per garbage UUID without aborting', async () => {
    const hannah = await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
      role: 'HRAdmin',
    });
    const marc = await seedEmployee(ctx.prisma, {
      personalNo: '0010',
      firstName: 'Marc',
      lastName: 'Becker',
      email: 'marc@test.local',
      role: 'Manager',
      managerId: hannah.id,
    });
    const reports = await Promise.all(
      ['1001', '1002', '1003'].map((no, i) =>
        seedEmployee(ctx.prisma, {
          personalNo: no,
          firstName: `R${i}`,
          lastName: 'Tester',
          email: `r${i}@test.local`,
          managerId: marc.id,
        }),
      ),
    );
    for (const r of reports) await seedLeaveAllowance(ctx.prisma, r.id, YEAR, 30);

    const reportTokens = await Promise.all(reports.map((r) => login(ctx.http, r.email)));
    const marcToken = await login(ctx.http, 'marc@test.local');

    const requestIds: string[] = [];
    for (let i = 0; i < reports.length; i += 1) {
      const res = await ctx.http
        .post('/api/requests/vacation')
        .set('Authorization', `Bearer ${reportTokens[i]}`)
        .send({
          employeeId: reports[i].id,
          from: `${YEAR}-08-${String(3 + i * 3).padStart(2, '0')}T00:00:00.000Z`,
          to: `${YEAR}-08-${String(4 + i * 3).padStart(2, '0')}T00:00:00.000Z`,
          substituteId: null,
        })
        .expect(201);
      requestIds.push(res.body.id);
    }

    const garbage = '00000000-0000-0000-0000-000000000000';
    const res = await ctx.http
      .post('/api/requests/bulk-approve')
      .set('Authorization', `Bearer ${marcToken}`)
      .send({ actorId: marc.id, ids: [...requestIds, garbage], note: 'bulk OK' })
      .expect(201);

    const okResults = res.body.filter((r: { ok: boolean }) => r.ok);
    const failResults = res.body.filter((r: { ok: boolean }) => !r.ok);
    expect(okResults).toHaveLength(3);
    expect(failResults).toHaveLength(1);
    expect(failResults[0]).toMatchObject({ id: garbage, ok: false });
    expect(failResults[0].error).toMatch(/not found/i);

    for (const id of requestIds) {
      const r = await ctx.http
        .get(`/api/requests/${id}`)
        .set('Authorization', `Bearer ${marcToken}`)
        .expect(200);
      expect(r.body.workflowState).toBe('Approved');
    }
  });
});
