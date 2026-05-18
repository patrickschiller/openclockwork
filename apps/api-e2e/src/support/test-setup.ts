/* eslint-disable */
// Per-spec setup runs in each test worker BEFORE the test file (and therefore
// AppModule + ConfigModule) is loaded. Defaults set in globalSetup do not
// propagate to workers, so we mirror them here. A real .env value already
// in process.env wins (devs may override locally).
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://openclockwork:openclockwork@localhost:5433/openclockwork_test?schema=public';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-test-secret-change-me';
process.env.ERP_API_KEY = 'e2e-erp-key'; // force — the e2e suite hard-codes this
process.env.API_CORS_ORIGINS = process.env.API_CORS_ORIGINS ?? 'http://localhost:4200';
process.env.API_PORT = process.env.API_PORT ?? '0';

export {};
