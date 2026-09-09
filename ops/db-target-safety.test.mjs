import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import safety from './db-target-safety.cjs';

const url = (name = 'openclockwork_test', host = 'localhost:5433') =>
  `postgresql://tester:never-print-this@${host}/${name}?schema=public`;
const e2e = (extra = {}) => ({ E2E_DATABASE_URL: url(), ...extra });
const maintenance = (name = 'openclockwork_demo', extra = {}) => ({
  DATABASE_URL: url(name),
  OPENCLOCKWORK_SEED_CONFIRM_DATABASE: name,
  OPENCLOCKWORK_RESET_CONFIRM_DATABASE: name,
  ...extra,
});
const refused = (run) => assert.throws(run, safety.DatabaseTargetRefusedError);

test('E2E requires its own explicit URL even if DATABASE_URL looks safe', () => {
  for (const env of [{}, { DATABASE_URL: url() }, { E2E_DATABASE_URL: '' }])
    refused(() => safety.assertE2eTarget(env));
});

test('E2E allows only the named test database and controlled temporary test suffixes', () => {
  for (const name of [
    'openclockwork_test',
    'openclockwork_test_bootstrap_123',
    'openclockwork_test_upgrade_abc',
  ])
    assert.equal(
      safety.assertE2eTarget(e2e({ E2E_DATABASE_URL: url(name) })).databaseName,
      name,
    );
  for (const name of [
    'openclockwork',
    'openclockwork_prod',
    'customer_test',
    'openclockwork_dev',
    'openclockwork_demo',
    'openclockwork_test_',
    'openclockwork_test_ABC',
    'openclockwork_test-123',
  ])
    refused(() => safety.assertE2eTarget(e2e({ E2E_DATABASE_URL: url(name) })));
});

test('a conflicting application connection fails closed instead of silently switching databases', () => {
  for (const databaseUrl of [
    url('openclockwork'),
    url('openclockwork_test', 'other-host:5433'),
    url().replace('tester:', 'different:'),
    '',
  ])
    refused(() => safety.assertE2eTarget(e2e({ DATABASE_URL: databaseUrl })));
  assert.equal(
    safety.assertE2eTarget(e2e({ DATABASE_URL: url() })).databaseName,
    'openclockwork_test',
  );
});

test('equivalent standard PostgreSQL URL spellings are accepted', () => {
  const target = safety.assertE2eTarget({
    E2E_DATABASE_URL: 'postgres://user:secret@localhost/openclockwork_test',
    DATABASE_URL:
      'postgresql://user:secret@localhost:5432/openclockwork_test?schema=public',
  });
  assert.equal(target.databaseName, 'openclockwork_test');
});

test('admin connection derives from the selected test server, including nondefault ports', () => {
  const target = safety.assertE2eTarget(
    e2e({ E2E_DATABASE_URL: url('openclockwork_test', '127.0.0.1:15433') }),
  );
  assert.equal(new URL(target.adminUrl).pathname, '/postgres');
  assert.equal(new URL(target.adminUrl).port, '15433');
});

test('an explicit admin connection must select postgres on the same server', () => {
  for (const admin of [
    url('openclockwork_test'),
    url('postgres', 'elsewhere:5433'),
    url('postgres', 'localhost:5432'),
  ])
    refused(() =>
      safety.assertE2eTarget(e2e({ E2E_ADMIN_DATABASE_URL: admin })),
    );
  assert.equal(
    new URL(
      safety.assertE2eTarget(e2e({ E2E_ADMIN_DATABASE_URL: url('postgres') }))
        .adminUrl,
    ).pathname,
    '/postgres',
  );
});

test('all test, seed and reset entrypoints reject production regardless of confirmations', () => {
  for (const NODE_ENV of ['production', ' Production ']) {
    refused(() => safety.assertE2eTarget(e2e({ NODE_ENV })));
    refused(() =>
      safety.assertSeedTarget(maintenance('openclockwork_demo', { NODE_ENV })),
    );
    refused(() =>
      safety.assertResetTarget(maintenance('openclockwork_demo', { NODE_ENV })),
    );
    refused(() =>
      safety.assertDemoResetTarget(
        maintenance('openclockwork_demo', {
          NODE_ENV,
          DEMO_RESET_ENABLED: 'true',
          DEMO_RESET_CONFIRMATION: 'DELETE-AND-RESEED-OPENClockwork-DEMO',
        }),
      ),
    );
  }
});

test('URLs cannot redirect the checked connection through query options or encoded identifiers', () => {
  for (const raw of [
    'not-a-url',
    'file:///openclockwork_test',
    'postgresql:///openclockwork_test',
    url().replace('openclockwork_test', '%6fpenclockwork_test'),
    url().replace('openclockwork_test', 'openclockwork_test%2fother'),
    `${url()}#fragment`,
    `${url()}&schema=public`,
    `${url()}&schema=private`,
    `${url()}&host=production`,
    `${url()}&dbname=production`,
    `${url()}&database=production`,
    `${url()}&options=-csearch_path=private`,
    `${url()}&service=production`,
  ])
    refused(() => safety.assertE2eTarget(e2e({ E2E_DATABASE_URL: raw })));
});

test('supported TLS and pool settings remain usable', () => {
  const target = safety.assertSeedTarget(
    maintenance('openclockwork_demo', {
      DATABASE_URL: `${url('openclockwork_demo')}&sslmode=require&connection_limit=2`,
    }),
  );
  assert.equal(
    new URL(target.databaseUrl).searchParams.get('sslmode'),
    'require',
  );
});

test('maintenance allows explicit dev, demo and test targets, including temporary suffixes', () => {
  for (const name of [
    'openclockwork_dev',
    'openclockwork_demo',
    'openclockwork_test',
    'openclockwork_test_bootstrap_123',
  ]) {
    assert.equal(safety.assertSeedTarget(maintenance(name)).databaseName, name);
    assert.equal(
      safety.assertResetTarget(maintenance(name)).databaseName,
      name,
    );
  }
});

test('normal or production database names cannot be enabled by a confirmation', () => {
  for (const name of [
    'openclockwork',
    'openclockwork_prod',
    'openclockwork_production',
    'customer_test',
    'postgres',
  ]) {
    refused(() => safety.assertSeedTarget(maintenance(name)));
    refused(() => safety.assertResetTarget(maintenance(name)));
  }
});

test('seed and reset each require their own exact target-name confirmation', () => {
  for (const value of [
    undefined,
    '',
    'true',
    'openclockwork_test',
    'OPENClockwork_demo',
  ]) {
    refused(() =>
      safety.assertSeedTarget(
        maintenance('openclockwork_demo', {
          OPENCLOCKWORK_SEED_CONFIRM_DATABASE: value,
        }),
      ),
    );
    refused(() =>
      safety.assertResetTarget(
        maintenance('openclockwork_demo', {
          OPENCLOCKWORK_RESET_CONFIRM_DATABASE: value,
        }),
      ),
    );
  }
});

test('demo reset preserves its existing confirmations in addition to the new target check', () => {
  refused(() => safety.assertDemoResetTarget(maintenance()));
  refused(() =>
    safety.assertDemoResetTarget(
      maintenance('openclockwork_demo', { DEMO_RESET_ENABLED: 'true' }),
    ),
  );
  const env = maintenance('openclockwork_demo', {
    DEMO_RESET_ENABLED: 'true',
    DEMO_RESET_CONFIRMATION: 'DELETE-AND-RESEED-OPENClockwork-DEMO',
  });
  assert.equal(
    safety.assertDemoResetTarget(env).databaseName,
    'openclockwork_demo',
  );
  refused(() =>
    safety.assertDemoResetTarget({
      ...env,
      OPENCLOCKWORK_RESET_CONFIRM_DATABASE: undefined,
    }),
  );
});

test('the actual connected database and schema must match before TRUNCATE or seed', () => {
  const target = safety.assertE2eTarget(e2e());
  safety.assertConnectedDatabase(target, 'openclockwork_test', 'public');
  refused(() =>
    safety.assertConnectedDatabase(target, 'openclockwork', 'public'),
  );
  refused(() =>
    safety.assertConnectedDatabase(target, 'openclockwork_test', 'private'),
  );
});

test('rejections never include credentials or the raw database URL', () => {
  try {
    safety.assertE2eTarget(e2e({ DATABASE_URL: url('openclockwork') }));
    assert.fail('Expected refusal');
  } catch (error) {
    assert.ok(error instanceof safety.DatabaseTargetRefusedError);
    assert.doesNotMatch(error.message, /never-print-this|postgresql:\/\//);
  }
});

test('seed, demo-reset and reset CLI paths reject production before any connection attempt', () => {
  // Port 1 is deliberately unusable; success means guard refusal, not a failed DB connection.
  for (const args of [
    ['--import', 'tsx', 'prisma/seed.ts'],
    ['--import', 'tsx', 'prisma/demo-reset.ts'],
    ['ops/safe-db-reset.mjs'],
  ]) {
    const result = spawnSync(process.execPath, args, {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      timeout: 15000,
      env: {
        ...process.env,
        ...maintenance('openclockwork_demo'),
        DATABASE_URL: url('openclockwork_demo', '127.0.0.1:1'),
        NODE_ENV: 'production',
      },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /disabled in NODE_ENV=production/);
    assert.doesNotMatch(
      result.stderr,
      /never-print-this|postgresql:\/\/|Can't reach database/,
    );
  }
});

test('reset CLI refuses argument-based target overrides before invoking Prisma', () => {
  const result = spawnSync(
    process.execPath,
    ['ops/safe-db-reset.mjs', '--url', url('openclockwork')],
    {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, ...maintenance(), NODE_ENV: 'test' },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /accepts no arguments/);
  assert.doesNotMatch(result.stderr, /never-print-this|postgresql:\/\//);
});
