import { createTestApp, login, seedEmployee, type TestContext } from '../support/test-app';

describe('Auth — POST /api/auth/login', () => {
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

  it('returns a JWT and the employee on valid credentials', async () => {
    await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
      role: 'HRAdmin',
    });

    const res = await ctx.http
      .post('/api/auth/login')
      .send({ email: 'hannah@test.local', password: 'test1234' })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.employee).toMatchObject({
      email: 'hannah@test.local',
      firstName: 'Hannah',
      role: 'HRAdmin',
    });
  });

  it('rejects wrong password with 401', async () => {
    await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
    });

    await ctx.http
      .post('/api/auth/login')
      .send({ email: 'hannah@test.local', password: 'totally-wrong' })
      .expect(401);
  });

  it('rejects unknown email with 401', async () => {
    await ctx.http
      .post('/api/auth/login')
      .send({ email: 'ghost@test.local', password: 'test1234' })
      .expect(401);
  });

  it('rejects login for deactivated employees', async () => {
    const e = await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
    });
    await ctx.prisma.employee.update({ where: { id: e.id }, data: { isActive: false } });

    await ctx.http
      .post('/api/auth/login')
      .send({ email: 'hannah@test.local', password: 'test1234' })
      .expect(401);
  });

  it('GET /api/auth/me echoes the token subject', async () => {
    await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
      role: 'HRAdmin',
    });
    const token = await login(ctx.http, 'hannah@test.local');

    const res = await ctx.http
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({ email: 'hannah@test.local', role: 'HRAdmin' });
  });
});
