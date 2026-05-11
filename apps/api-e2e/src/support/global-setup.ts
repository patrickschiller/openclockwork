import { execSync } from 'child_process';
import { Client } from 'pg';

/* eslint-disable */
declare const globalThis: { __TEARDOWN_MESSAGE__?: string };

const TEST_DB_NAME = 'openclockwork_test';
const ADMIN_URL = 'postgresql://openclockwork:openclockwork@localhost:5433/postgres';
const TEST_DATABASE_URL = `postgresql://openclockwork:openclockwork@localhost:5433/${TEST_DB_NAME}?schema=public`;

module.exports = async function () {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-test-secret-change-me';
  process.env.ERP_API_KEY = process.env.ERP_API_KEY ?? 'e2e-erp-key';
  process.env.API_CORS_ORIGINS = process.env.API_CORS_ORIGINS ?? 'http://localhost:4200';
  process.env.API_PORT = process.env.API_PORT ?? '0';

  // 1. Make sure the test database exists.
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB_NAME]);
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
    }
  } finally {
    await admin.end();
  }

  // 2. Apply Prisma migrations to the (now-existing) test database.
  execSync('pnpm exec prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });

  globalThis.__TEARDOWN_MESSAGE__ = '\nE2E teardown complete.\n';
};
