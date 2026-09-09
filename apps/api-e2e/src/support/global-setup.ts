import { execFileSync } from 'node:child_process';
import { Client } from 'pg';
import { assertE2eTarget } from './database-target';

/* eslint-disable */
declare const globalThis: { __TEARDOWN_MESSAGE__?: string };

module.exports = async function () {
  const target = assertE2eTarget();
  process.env.DATABASE_URL = target.databaseUrl;
  process.env.JWT_SECRET =
    process.env.JWT_SECRET ?? 'e2e-test-secret-change-me';
  process.env.ERP_API_KEY = process.env.ERP_API_KEY ?? 'e2e-erp-key';
  process.env.API_CORS_ORIGINS =
    process.env.API_CORS_ORIGINS ?? 'http://localhost:4200';
  process.env.API_PORT = process.env.API_PORT ?? '0';

  // 1. Make sure the test database exists.
  const admin = new Client({ connectionString: target.adminUrl });
  await admin.connect();
  try {
    const exists = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [target.databaseName],
    );
    if (exists.rowCount === 0) {
      // The guard permits only a fixed test prefix and identifier-safe suffix.
      await admin.query(`CREATE DATABASE "${target.databaseName}"`);
    }
  } finally {
    await admin.end();
  }

  // 2. Apply Prisma migrations to the (now-existing) test database.
  const prismaCli = require.resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: target.databaseUrl },
  });

  globalThis.__TEARDOWN_MESSAGE__ = '\nE2E teardown complete.\n';
};
