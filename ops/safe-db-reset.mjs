import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import safety from './db-target-safety.cjs';

try {
  if (process.argv.length !== 2)
    throw new safety.DatabaseTargetRefusedError(
      'db:reset accepts no arguments; configure the explicit database and confirmation via environment variables.',
    );
  const target = safety.assertResetTarget();
  const require = createRequire(import.meta.url);
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('prisma/build/index.js'),
      'migrate',
      'reset',
      '--force',
      '--skip-seed',
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: target.databaseUrl },
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(
    error instanceof safety.DatabaseTargetRefusedError
      ? error.message
      : 'Database reset failed; no connection details are printed.',
  );
  process.exitCode = 1;
}
