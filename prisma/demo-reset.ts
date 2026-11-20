import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'child_process';
import safety from '../ops/db-target-safety.cjs';

let prisma: PrismaClient;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function truncateApplicationTables(): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `;

  if (tables.length === 0) {
    throw new Error(
      'Refusing demo reset: no application tables found in the public schema.',
    );
  }

  const tableList = tables
    .map(({ tablename }) => quoteIdentifier(tablename))
    .join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`,
  );
}

function seedDatabase(target: {
  databaseUrl: string;
  databaseName: string;
}): void {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'prisma/seed.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: target.databaseUrl,
        OPENCLOCKWORK_SEED_CONFIRM_DATABASE: target.databaseName,
      },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Demo seed failed with exit code ${result.status ?? 'unknown'}.`,
    );
  }
}

async function main(): Promise<void> {
  const target = safety.assertDemoResetTarget();
  prisma = new PrismaClient({ datasourceUrl: target.databaseUrl });
  const [connected] = await prisma.$queryRaw<
    Array<{ database: string; schema: string }>
  >`
    SELECT current_database() AS database, current_schema() AS schema
  `;
  safety.assertConnectedDatabase(target, connected.database, connected.schema);

  await truncateApplicationTables();
  await prisma.$disconnect();
  seedDatabase(target);

  console.log('Demo reset complete.');
}

main()
  .catch((err) => {
    console.error(
      err instanceof safety.DatabaseTargetRefusedError
        ? err.message
        : 'Demo reset failed; no connection details are printed.',
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
