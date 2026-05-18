import { createTestApp, seedEmployee, type TestContext } from '../support/test-app';

describe('Auth — refresh tokens', () => {
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

  it('login returns both tokens + expiresIn', async () => {
    await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
    });
    const res = await ctx.http
      .post('/api/auth/login')
      .send({ email: 'hannah@test.local', password: 'test1234' })
      .expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.expiresIn).toBe(15 * 60);
    // Tokens must be different — one is access, one is refresh.
    expect(res.body.accessToken).not.toBe(res.body.refreshToken);
  });

  it('refresh rotates both tokens and lets the new access call /me', async () => {
    await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
    });
    const login = await ctx.http
      .post('/api/auth/login')
      .send({ email: 'hannah@test.local', password: 'test1234' })
      .expect(200);

    const refreshed = await ctx.http
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(refreshed.body.refreshToken).toEqual(expect.any(String));
    expect(refreshed.body.accessToken).not.toBe(login.body.accessToken);
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

    await ctx.http
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .expect(200);
  });

  it('rejects garbage refresh token with 401', async () => {
    await ctx.http
      .post('/api/auth/refresh')
      .send({ refreshToken: 'this.is.not.a.jwt' })
      .expect(401);
  });

  it('rejects an access token used as refresh token', async () => {
    await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
    });
    const login = await ctx.http
      .post('/api/auth/login')
      .send({ email: 'hannah@test.local', password: 'test1234' })
      .expect(200);
    await ctx.http
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.accessToken })
      .expect(401);
  });

  it('rejects a refresh token used as access token (Authorization header)', async () => {
    await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
    });
    const login = await ctx.http
      .post('/api/auth/login')
      .send({ email: 'hannah@test.local', password: 'test1234' })
      .expect(200);
    await ctx.http
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.refreshToken}`)
      .expect(401);
  });

  it('refusing to refresh once the employee is deactivated', async () => {
    const e = await seedEmployee(ctx.prisma, {
      personalNo: '0001',
      firstName: 'Hannah',
      lastName: 'Roth',
      email: 'hannah@test.local',
    });
    const login = await ctx.http
      .post('/api/auth/login')
      .send({ email: 'hannah@test.local', password: 'test1234' })
      .expect(200);
    await ctx.prisma.employee.update({ where: { id: e.id }, data: { isActive: false } });
    await ctx.http
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });
});
