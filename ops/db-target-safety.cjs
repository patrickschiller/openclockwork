'use strict';

// Keep this dependency-free: every caller checks its target before connecting.
const TEST_DATABASE = /^openclockwork_test(?:_[a-z0-9]+)*$/;
const NON_PRODUCTION_DATABASE =
  /^openclockwork_(?:dev|demo|test)(?:_[a-z0-9]+)*$/;
const CONNECTION_OPTIONS = new Set([
  'schema',
  'sslmode',
  'sslaccept',
  'sslrootcert',
  'sslcert',
  'sslidentity',
  'sslpassword',
  'connect_timeout',
  'pool_timeout',
  'connection_limit',
  'pgbouncer',
  'statement_cache_size',
  'application_name',
  'channel_binding',
]);

class DatabaseTargetRefusedError extends Error {
  constructor(message) {
    super(`Database target refused: ${message}`);
    this.name = 'DatabaseTargetRefusedError';
  }
}

function refuse(message) {
  throw new DatabaseTargetRefusedError(message);
}

function assertNotProduction(env) {
  if ((env.NODE_ENV ?? '').trim().toLowerCase() === 'production')
    refuse(
      'test, seed and reset commands are disabled in NODE_ENV=production.',
    );
}

function parseDatabaseUrl(raw, label) {
  if (typeof raw !== 'string' || !raw.trim())
    refuse(`${label} must be explicit.`);
  let url;
  try {
    url = new URL(raw);
  } catch {
    refuse(`${label} must be a PostgreSQL URL.`);
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    url.hash
  )
    refuse(
      `${label} must be a PostgreSQL URL with an explicit host and database.`,
    );
  if (!/^\/[a-z][a-z0-9_]*$/.test(url.pathname))
    refuse(
      `${label} must use a plain lowercase database name without encoded characters.`,
    );
  const seen = new Set();
  for (const [key] of url.searchParams) {
    if (!CONNECTION_OPTIONS.has(key) || seen.has(key))
      refuse(`${label} contains an unsupported or repeated connection option.`);
    seen.add(key);
  }
  if (
    url.searchParams.has('schema') &&
    url.searchParams.get('schema') !== 'public'
  )
    refuse(`${label} must select the public schema.`);
  url.protocol = 'postgresql:';
  if (!url.port) url.port = '5432';
  url.searchParams.set('schema', 'public');
  url.searchParams.sort();
  return {
    url,
    databaseName: url.pathname.slice(1),
    databaseUrl: url.toString(),
  };
}

function assertE2eTarget(env = process.env) {
  assertNotProduction(env);
  const target = parseDatabaseUrl(env.E2E_DATABASE_URL, 'E2E_DATABASE_URL');
  if (!TEST_DATABASE.test(target.databaseName))
    refuse(
      'E2E_DATABASE_URL must select openclockwork_test or openclockwork_test_<alphanumeric suffix>.',
    );
  if (env.DATABASE_URL !== undefined) {
    const application = parseDatabaseUrl(env.DATABASE_URL, 'DATABASE_URL');
    if (application.databaseUrl !== target.databaseUrl)
      refuse(
        'DATABASE_URL conflicts with E2E_DATABASE_URL; unset it or explicitly select the same test connection.',
      );
  }
  const defaultAdmin = new URL(target.databaseUrl);
  defaultAdmin.pathname = '/postgres';
  const admin = parseDatabaseUrl(
    env.E2E_ADMIN_DATABASE_URL ?? defaultAdmin.toString(),
    'E2E_ADMIN_DATABASE_URL',
  );
  if (
    admin.databaseName !== 'postgres' ||
    admin.url.hostname !== target.url.hostname ||
    admin.url.port !== target.url.port
  )
    refuse(
      'E2E_ADMIN_DATABASE_URL must select postgres on the same host and port as the test database.',
    );
  return {
    databaseUrl: target.databaseUrl,
    databaseName: target.databaseName,
    adminUrl: admin.databaseUrl,
  };
}

function assertMaintenanceTarget(operation, env = process.env) {
  assertNotProduction(env);
  const target = parseDatabaseUrl(env.DATABASE_URL, 'DATABASE_URL');
  if (!NON_PRODUCTION_DATABASE.test(target.databaseName))
    refuse(
      'seed/reset requires openclockwork_dev, openclockwork_demo or openclockwork_test, optionally followed by alphanumeric underscore-separated suffixes.',
    );
  const confirmation =
    operation === 'seed'
      ? 'OPENCLOCKWORK_SEED_CONFIRM_DATABASE'
      : 'OPENCLOCKWORK_RESET_CONFIRM_DATABASE';
  if (env[confirmation] !== target.databaseName)
    refuse(`${confirmation} must exactly match the selected database name.`);
  return { databaseUrl: target.databaseUrl, databaseName: target.databaseName };
}

function assertSeedTarget(env = process.env) {
  return assertMaintenanceTarget('seed', env);
}

function assertResetTarget(env = process.env) {
  return assertMaintenanceTarget('reset', env);
}

function assertDemoResetTarget(env = process.env) {
  const target = assertResetTarget(env);
  if (
    env.DEMO_RESET_ENABLED !== 'true' ||
    env.DEMO_RESET_CONFIRMATION !== 'DELETE-AND-RESEED-OPENClockwork-DEMO'
  )
    refuse(
      'demo reset requires DEMO_RESET_ENABLED=true and the documented DEMO_RESET_CONFIRMATION.',
    );
  return target;
}

function assertConnectedDatabase(target, databaseName, schemaName) {
  if (databaseName !== target.databaseName || schemaName !== 'public')
    refuse('the connected database/schema differs from the confirmed target.');
}

module.exports = {
  DatabaseTargetRefusedError,
  assertE2eTarget,
  assertSeedTarget,
  assertResetTarget,
  assertDemoResetTarget,
  assertConnectedDatabase,
};
