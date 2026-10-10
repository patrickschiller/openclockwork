import { assertE2eTarget } from './database-target';

/* eslint-disable */
// Per-spec setup runs in each test worker BEFORE the test file (and therefore
// AppModule + ConfigModule) is loaded. Defaults set in globalSetup do not
// propagate to workers, so validate independently here. An unrelated inherited
// DATABASE_URL must never win over the explicitly selected test database.
process.env.DATABASE_URL = assertE2eTarget().databaseUrl;
// Pin the fixture timezone independently of the deployment default.
// Core-time and off-hours assertions use these explicit wall-clock times.
process.env.TZ = 'Europe/Berlin';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-test-secret-change-me';
process.env.ERP_API_KEY = 'e2e-erp-key'; // force — the e2e suite hard-codes this
process.env.CRON_API_KEY = 'e2e-cron-key'; // force — the e2e suite hard-codes this
process.env.API_CORS_ORIGINS =
  process.env.API_CORS_ORIGINS ?? 'http://localhost:4200';
process.env.API_PORT = process.env.API_PORT ?? '0';
// Each Jest worker gets its own attachment dir so concurrent test files
// don't trip over each other. tmpdir + pid + run timestamp is unique enough.
process.env.ATTACHMENTS_DIR =
  process.env.ATTACHMENTS_DIR ??
  `${require('os').tmpdir()}/openclockwork-attachments-${process.pid}-${Date.now()}`;

export {};
