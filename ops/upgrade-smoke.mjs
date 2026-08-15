import pg from 'pg';

const { Client } = pg;
const mode = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !['seed', 'verify'].includes(mode)) {
  console.error(
    'Usage: DATABASE_URL=postgresql://... node ops/upgrade-smoke.mjs <seed|verify>',
  );
  process.exit(1);
}

const employeeId = '00000000-0000-4000-8000-000000000014';
const timeEntryId = '00000000-0000-4000-8000-000000000114';
const client = new Client({ connectionString: databaseUrl });

await client.connect();

try {
  if (mode === 'seed') {
    await client.query(
      `INSERT INTO "Employee" (
        "id", "personalNo", "firstName", "lastName", "email",
        "passwordHash", "role", "timeModel", "weeklyHours",
        "annualLeaveDays", "startDate", "createdAt", "updatedAt"
      ) VALUES (
        $1, 'UPGRADE-001', 'Upgrade', 'Sentinel', 'upgrade-sentinel@example.invalid',
        'not-a-real-password-hash', 'HRAdmin', 'Vollzeit', 40, 30,
        DATE '2020-01-01', TIMESTAMP '2026-01-02 08:00:00', TIMESTAMP '2026-01-02 08:00:00'
      )`,
      [employeeId],
    );

    await client.query(
      `INSERT INTO "TimeEntry" (
        "id", "employeeId", "clockIn", "clockOut", "source", "status",
        "requiresApproval", "note", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, TIMESTAMP '2026-01-02 08:00:00', TIMESTAMP '2026-01-02 16:30:00',
        'Manual', 'Approved', false, 'upgrade-smoke-sentinel',
        TIMESTAMP '2026-01-02 16:30:00', TIMESTAMP '2026-01-02 16:30:00'
      )`,
      [timeEntryId, employeeId],
    );

    console.log('Inserted upgrade sentinel employee and time entry.');
  } else {
    const sentinel = await client.query(
      `SELECT
        e."personalNo",
        e."email",
        t."note",
        t."status"::text AS "status"
      FROM "Employee" e
      JOIN "TimeEntry" t ON t."employeeId" = e."id"
      WHERE e."id" = $1 AND t."id" = $2`,
      [employeeId, timeEntryId],
    );

    const row = sentinel.rows[0];
    if (
      sentinel.rowCount !== 1 ||
      row.personalNo !== 'UPGRADE-001' ||
      row.email !== 'upgrade-sentinel@example.invalid' ||
      row.note !== 'upgrade-smoke-sentinel' ||
      row.status !== 'Approved'
    ) {
      throw new Error('Upgrade sentinel data was changed or removed.');
    }

    const failedMigrations = await client.query(
      `SELECT COUNT(*)::int AS "count"
       FROM "_prisma_migrations"
       WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL`,
    );

    if (failedMigrations.rows[0].count !== 0) {
      throw new Error(
        'The upgraded database contains an unfinished Prisma migration.',
      );
    }

    console.log(
      'Upgrade preserved sentinel data and all Prisma migrations finished.',
    );
  }
} finally {
  await client.end();
}
