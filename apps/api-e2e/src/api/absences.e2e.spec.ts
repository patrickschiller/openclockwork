import { createTestApp, login, seedEmployee, type TestContext } from '../support/test-app';

describe('Absences — Sickness / Training / Flextime', () => {
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

  it('creates entries of all three kinds for the logged-in employee', async () => {
    const anna = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Anna',
      lastName: 'Mueller',
      email: 'anna@test.local',
    });
    const token = await login(ctx.http, 'anna@test.local');

    const today = new Date().toISOString();
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();

    const sickness = await ctx.http
      .post('/api/absences')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId: anna.id, kind: 'Sickness', from: today, to: today, certified: true })
      .expect(201);
    expect(sickness.body).toMatchObject({ kind: 'Sickness', certified: true });

    const training = await ctx.http
      .post('/api/absences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId: anna.id,
        kind: 'Training',
        from: today,
        to: tomorrow,
        note: 'NestJS Schulung',
      })
      .expect(201);
    expect(training.body).toMatchObject({ kind: 'Training', note: 'NestJS Schulung' });

    const flextime = await ctx.http
      .post('/api/absences')
      .set('Authorization', `Bearer ${token}`)
      .send({ employeeId: anna.id, kind: 'Flextime', from: tomorrow, to: tomorrow })
      .expect(201);
    expect(flextime.body).toMatchObject({ kind: 'Flextime' });

    const list = await ctx.http
      .get(`/api/absences?employeeId=${anna.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const kinds = (list.body as Array<{ kind: string }>).map((a) => a.kind).sort();
    expect(kinds).toEqual(['Flextime', 'Sickness', 'Training']);
  });

  it('rejects unknown kinds with 400', async () => {
    const anna = await seedEmployee(ctx.prisma, {
      personalNo: '1001',
      firstName: 'Anna',
      lastName: 'Mueller',
      email: 'anna@test.local',
    });
    const token = await login(ctx.http, 'anna@test.local');

    await ctx.http
      .post('/api/absences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employeeId: anna.id,
        kind: 'Vacation', // not an AbsenceKind
        from: new Date().toISOString(),
        to: new Date().toISOString(),
      })
      .expect(400);
  });
});
