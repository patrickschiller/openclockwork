import { APP_VERSION } from '../../../api/src/app/app-version';
import { createTestApp, type TestContext } from '../support/test-app';

describe('Health — release compatibility', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('reports the API release version used by the web rollout guard', async () => {
    const response = await ctx.http.get('/api/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'openclockwork-api',
      version: APP_VERSION,
    });
    expect(response.body.utcTimestamp).toEqual(expect.any(String));
  });
});
