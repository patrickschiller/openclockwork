import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'child_process';

const prisma = new PrismaClient();
const REQUIRED_CONFIRMATION = 'DELETE-AND-RESEED-OPENClockwork-DEMO';

function assertDemoResetEnabled(): void {
  if (process.env.DEMO_RESET_ENABLED !== 'true') {
    throw new Error('Refusing demo reset: DEMO_RESET_ENABLED must be "true".');
  }
  if (process.env.DEMO_RESET_CONFIRMATION !== REQUIRED_CONFIRMATION) {
    throw new Error(
      `Refusing demo reset: DEMO_RESET_CONFIRMATION must equal "${REQUIRED_CONFIRMATION}".`,
    );
  }
}

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
    throw new Error('Refusing demo reset: no application tables found in the public schema.');
  }

  const tableList = tables.map(({ tablename }) => quoteIdentifier(tablename)).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}

async function clearAzureAttachments(): Promise<void> {
  if ((process.env.STORAGE_BACKEND ?? 'local').toLowerCase() !== 'azure-blob') return;

  const account = process.env.AZURE_BLOB_ACCOUNT;
  const container = process.env.AZURE_BLOB_CONTAINER;
  if (!account || !container) {
    throw new Error(
      'AZURE_BLOB_ACCOUNT and AZURE_BLOB_CONTAINER are required when STORAGE_BACKEND=azure-blob.',
    );
  }

  const service = new BlobServiceClient(
    `https://${account}.blob.core.windows.net`,
    new DefaultAzureCredential(),
  );
  const containerClient = service.getContainerClient(container);

  let deleted = 0;
  for await (const blob of containerClient.listBlobsFlat()) {
    await containerClient.deleteBlob(blob.name, { deleteSnapshots: 'include' });
    deleted += 1;
  }

  console.log(`Deleted ${deleted} attachment blob(s).`);
}

function seedDatabase(): void {
  const result = spawnSync('node', ['--import', 'tsx', 'prisma/seed.ts'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Demo seed failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

async function main(): Promise<void> {
  assertDemoResetEnabled();

  // Delete attachments first. If Blob access fails, the database remains
  // untouched and the job can be retried without producing orphaned blobs.
  await clearAzureAttachments();
  await truncateApplicationTables();
  await prisma.$disconnect();
  seedDatabase();

  console.log('Demo reset complete.');
}

main()
  .catch((err) => {
    console.error('Demo reset failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
