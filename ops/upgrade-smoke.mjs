import assert from 'node:assert/strict';
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
const correctionRequestId = '00000000-0000-4000-8000-000000000143';
const legacyAuditId = '00000000-0000-4000-8000-000000000243';
const pendingEntryId = '00000000-0000-4000-8000-000000000115';
const scheduleId = '00000000-0000-4000-8000-000000000214';
const terminalId = '00000000-0000-4000-8000-000000000314';
const fallbackEmployeeId = '00000000-0000-4000-8000-000000000414';
const legacyBreakRules = [
  { afterMinutes: 360, breakMinutes: 30 },
  { afterMinutes: 540, breakMinutes: 45 },
];
const client = new Client({ connectionString: databaseUrl });

await client.connect();

try {
  if (mode === 'seed') {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO "WorkSchedule" (
        "id", "name", "frameStart", "frameEnd", "workingDays", "updatedAt"
      ) VALUES ($1, 'Upgrade sentinel schedule', '07:00', '23:00', 31, CURRENT_TIMESTAMP)`,
      [scheduleId],
    );

    await client.query(
      `INSERT INTO "Employee" (
        "id", "personalNo", "firstName", "lastName", "email",
        "passwordHash", "role", "timeModel", "weeklyHours",
        "annualLeaveDays", "startDate", "bundesland", "workScheduleId", "createdAt", "updatedAt"
      ) VALUES (
        $1, 'UPGRADE-001', 'Upgrade', 'Sentinel', 'upgrade-sentinel@example.invalid',
        'not-a-real-password-hash', 'HRAdmin', 'Vollzeit', 40, 30,
        DATE '2020-01-01', 'BY', $2,
        TIMESTAMP '2026-01-02 08:00:00', TIMESTAMP '2026-01-02 08:00:00'
      )`,
      [employeeId, scheduleId],
    );

    await client.query(
      `INSERT INTO "Employee" (
        "id", "personalNo", "firstName", "lastName", "email",
        "passwordHash", "role", "timeModel", "weeklyHours",
        "annualLeaveDays", "startDate", "bundesland", "createdAt", "updatedAt"
      ) VALUES (
        $1, 'UPGRADE-002', 'Upgrade', 'Fallback', 'upgrade-fallback@example.invalid',
        'not-a-real-password-hash', 'Employee', 'Vollzeit', 40, 30,
        DATE '2020-01-01', 'NW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`,
      [fallbackEmployeeId],
    );

    await client.query(
      `INSERT INTO "Terminal" (
        "id", "name", "displayText", "locationLabel", "latitude", "longitude",
        "radiusMeters", "maxAccuracyMeters", "timeZone", "updatedAt"
      ) VALUES (
        $1, 'Upgrade sentinel terminal', 'Upgrade sentinel', 'Current terminal location',
        0, 0, 100, 50, 'Europe/Berlin', CURRENT_TIMESTAMP
      )`,
      [terminalId],
    );

    await client.query(
      `INSERT INTO "TimeEntry" (
        "id", "employeeId", "clockIn", "clockOut", "source", "status",
        "requiresApproval", "note", "terminalId", "clockOutTerminalId",
        "terminalLocationLabel", "clockOutTerminalLocationLabel", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, TIMESTAMP '2026-01-02 08:00:00', TIMESTAMP '2026-01-02 16:30:00',
        'Manual', 'Approved', false, 'upgrade-smoke-sentinel',
        $3, $3, 'Original clock-in location', 'Original clock-out location',
        TIMESTAMP '2026-01-02 16:30:00', TIMESTAMP '2026-01-02 16:30:00'
      )`,
      [timeEntryId, employeeId, terminalId],
    );

    // Keep this smoke test useful for subsequent upgrades whose baseline already
    // contains the configurable policies. Older schemas obtain them by migration.
    const policyColumns = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'Employee'
       AND column_name = 'holidayCalendar'`,
    );
    if (policyColumns.rowCount > 0) {
      await client.query(
        `UPDATE "Employee" SET "holidayCalendar" = 'DE-' || "bundesland",
         "workScheduleId" = $1 WHERE "id" IN ($2, $3)`,
        [scheduleId, employeeId, fallbackEmployeeId],
      );
      await client.query(
        `UPDATE "WorkSchedule" SET "breakRules" = $1::jsonb WHERE "id" = $2`,
        [JSON.stringify(legacyBreakRules), scheduleId],
      );
      await client.query(
        `UPDATE "TimeEntry" SET "breakRules" = $1::jsonb WHERE "id" = $2`,
        [JSON.stringify(legacyBreakRules), timeEntryId],
      );
    }
    // This row exists before the new approval columns and must remain pending,
    // with no fabricated manager sign-off after migration.
    await client.query(
      `INSERT INTO "TimeEntry" (
        "id", "employeeId", "clockIn", "clockOut", "source", "status",
        "requiresApproval", "revision", "approvalMode", "updatedAt"
      ) VALUES ($1, $2, TIMESTAMP '2026-01-05 06:00:00',
        TIMESTAMP '2026-01-05 08:00:00', 'Pwa', 'Pending', true, 7, NULL, CURRENT_TIMESTAMP)`,
      [pendingEntryId, fallbackEmployeeId],
    );
    // Missing-booking requests and existing audit payloads predate target
    // binding and must not acquire invented target/revision/request links.
    await client.query(
      `INSERT INTO "Request" (
        "id", "employeeId", "type", "status", "workflowState", "from", "to", "updatedAt"
       ) VALUES ($1, $2, 'TimeAdjustment', 'Submitted', 'PendingManager',
         TIMESTAMP '2026-01-06 08:00:00', TIMESTAMP '2026-01-06 16:00:00', CURRENT_TIMESTAMP)`,
      [correctionRequestId, fallbackEmployeeId],
    );
    await client.query(
      `INSERT INTO "TimeEntryAudit" ("id", "timeEntryId", "actorId", "action", "before", "after", "reason")
       VALUES ($1, $2, $3, 'UpgradeSentinel', '{"revision":0}'::jsonb, '{"revision":1}'::jsonb, 'Synthetic retained audit')`,
      [legacyAuditId, timeEntryId, employeeId],
    );
    await client.query('COMMIT');

    console.log(
      'Inserted upgrade sentinels for employees, policies, time entry, and terminal.',
    );
  } else {
    const unknownProxyHistory = await client.query(
      `SELECT COUNT(*)::int AS count FROM "TeamProxyAudit"`,
    );
    assert.equal(
      unknownProxyHistory.rows[0].count,
      0,
      'Migration must not invent proxy actors or operations for existing records.',
    );
    const unknownContractHistory = await client.query(
      `SELECT COUNT(*)::int AS count FROM "EmployeeContractPeriod"
       WHERE "employeeId" IN ($1, $2)`,
      [employeeId, fallbackEmployeeId],
    );
    assert.equal(
      unknownContractHistory.rows[0].count,
      0,
      'Legacy employees must have unknown contract history, not fabricated retrospective snapshots.',
    );
    const unknownContractAudit = await client.query(
      `SELECT COUNT(*)::int AS count FROM "EmployeeContractPeriodAudit"`,
    );
    assert.equal(
      unknownContractAudit.rows[0].count,
      0,
      'Migration must not invent HR confirmations or actors.',
    );
    const legacyCorrection = await client.query(
      `SELECT "targetTimeEntryId", "expectedTargetRevision", "targetTimeEntryBefore",
        "workflowState"::text, "type"::text,
        "from" = TIMESTAMP '2026-01-06 08:00:00' AS "fromPreserved"
       FROM "Request" WHERE "id" = $1`,
      [correctionRequestId],
    );
    assert.deepEqual(
      legacyCorrection.rows,
      [
        {
          targetTimeEntryId: null,
          expectedTargetRevision: null,
          targetTimeEntryBefore: null,
          workflowState: 'PendingManager',
          type: 'TimeAdjustment',
          fromPreserved: true,
        },
      ],
      'Legacy missing-booking requests must remain targetless.',
    );
    const legacyAudit = await client.query(
      `SELECT "requestId", "action", "before", "after", "reason", "actorId"
       FROM "TimeEntryAudit" WHERE "id" = $1`,
      [legacyAuditId],
    );
    assert.deepEqual(
      legacyAudit.rows,
      [
        {
          requestId: null,
          action: 'UpgradeSentinel',
          before: { revision: 0 },
          after: { revision: 1 },
          reason: 'Synthetic retained audit',
          actorId: employeeId,
        },
      ],
      'Existing audits must retain values and actor without inventing a request link.',
    );
    const pending = await client.query(
      `SELECT "status"::text, "requiresApproval", "revision", "approvalMode",
        "frameApproverId", "frameApprovedRevision",
        "clockIn" = TIMESTAMP '2026-01-05 06:00:00' AS "clockInPreserved",
        "clockOut" = TIMESTAMP '2026-01-05 08:00:00' AS "clockOutPreserved"
       FROM "TimeEntry" WHERE "id" = $1`,
      [pendingEntryId],
    );
    assert.deepEqual(
      pending.rows,
      [
        {
          status: 'Pending',
          requiresApproval: true,
          revision: 7,
          approvalMode: null,
          frameApproverId: null,
          frameApprovedRevision: null,
          clockInPreserved: true,
          clockOutPreserved: true,
        },
      ],
      'Legacy pending entries must start at manager review without altering working time.',
    );
    const sentinel = await client.query(
      `SELECT
        e."personalNo",
        e."email",
        e."bundesland",
        e."holidayCalendar",
        e."holidayDates",
        e."workScheduleId",
        t."note",
        t."status"::text AS "status",
        t."breakRules" AS "entryBreakRules",
        t."clockIn" = TIMESTAMP '2026-01-02 08:00:00' AS "clockInPreserved",
        t."clockOut" = TIMESTAMP '2026-01-02 16:30:00' AS "clockOutPreserved",
        t."terminalLocationLabel",
        t."clockOutTerminalLocationLabel",
        t."clockOutTerminalId",
        s."breakRules" AS "scheduleBreakRules",
        terminal."timeZone"
      FROM "Employee" e
      JOIN "TimeEntry" t ON t."employeeId" = e."id"
      JOIN "WorkSchedule" s ON s."id" = e."workScheduleId"
      JOIN "Terminal" terminal ON terminal."id" = t."terminalId"
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
    assert.equal(row.bundesland, 'BY', 'Legacy region must be preserved.');
    assert.equal(
      row.holidayCalendar,
      'DE-BY',
      'Existing regional calendar must be preserved.',
    );
    assert.deepEqual(
      row.holidayDates,
      [],
      'Migration must not invent custom holidays.',
    );
    assert.equal(
      row.workScheduleId,
      scheduleId,
      'Existing schedule assignment must be preserved.',
    );
    assert.deepEqual(
      row.scheduleBreakRules,
      legacyBreakRules,
      'Existing schedule must retain legacy breaks.',
    );
    assert.deepEqual(
      row.entryBreakRules,
      legacyBreakRules,
      'Historical entry must retain its break policy.',
    );
    assert.equal(
      row.clockInPreserved,
      true,
      'Clock-in timestamp must be preserved.',
    );
    assert.equal(
      row.clockOutPreserved,
      true,
      'Clock-out timestamp must be preserved.',
    );
    assert.equal(row.terminalLocationLabel, 'Original clock-in location');
    assert.equal(
      row.clockOutTerminalLocationLabel,
      'Original clock-out location',
    );
    assert.equal(row.clockOutTerminalId, terminalId);
    assert.equal(
      row.timeZone,
      'Europe/Berlin',
      'Stored terminal timezone must be preserved.',
    );

    const fallback = await client.query(
      `SELECT e."holidayCalendar", s."breakRules", s."frameStart", s."frameEnd", s."workingDays", s."isDefault"
       FROM "Employee" e JOIN "WorkSchedule" s ON s."id" = e."workScheduleId"
       WHERE e."id" = $1`,
      [fallbackEmployeeId],
    );
    assert.equal(
      fallback.rowCount,
      1,
      'Existing implicit schedule must become an explicit policy.',
    );
    assert.deepEqual(
      fallback.rows[0],
      {
        holidayCalendar: 'DE-NW',
        breakRules: legacyBreakRules,
        frameStart: '07:00',
        frameEnd: '23:00',
        workingDays: 31,
        isDefault: false,
      },
      'Legacy fallback policy must be retained without becoming a default for new employees.',
    );

    const soloSchema = await client.query(
      `SELECT to_regclass('"InstallationSettings"') AS table_name`,
    );
    if (soloSchema.rows[0].table_name) {
      const installation = await client.query(
        `SELECT "mode", "ownerEmployeeId", "setupCompleted" FROM "InstallationSettings" WHERE "id" = 1`,
      );
      assert.deepEqual(
        installation.rows,
        [{ mode: 'Team', ownerEmployeeId: null, setupCompleted: true }],
        'An upgraded installation must stay Team without inventing an owner.',
      );
      const historical = await client.query(
        `SELECT "billable", "revision", "voidedAt", "captureGroupId", "approvalMode" FROM "TimeEntry" WHERE "id" = $1`,
        [timeEntryId],
      );
      assert.deepEqual(
        historical.rows,
        [
          {
            billable: false,
            revision: 0,
            voidedAt: null,
            captureGroupId: null,
            approvalMode: null,
          },
        ],
        'Solo migration must not reclassify historical work.',
      );
    }

    const failedMigrations = await client.query(
      `SELECT COUNT(*)::int AS "count"
       FROM "_prisma_migrations"
       WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL`,
    );

    const pinSchema = await client.query(
      `SELECT to_regclass('"TerminalCredential"') AS table_name`,
    );
    if (pinSchema.rows[0].table_name) {
      const terminal = await client.query(
        'SELECT "allowedAuthMethods", "authConfigVersion" FROM "Terminal" WHERE "id"=$1',
        [terminalId],
      );
      assert.deepEqual(
        terminal.rows,
        [{ allowedAuthMethods: ['QR'], authConfigVersion: 0 }],
        'PIN upgrade must preserve QR-only terminals',
      );
      const credentials = await client.query(
        'SELECT COUNT(*)::int AS count FROM "TerminalCredential"',
      );
      assert.equal(
        credentials.rows[0].count,
        0,
        'Upgrade must not invent employee PINs',
      );
    }

    if (failedMigrations.rows[0].count !== 0) {
      throw new Error(
        'The upgraded database contains an unfinished Prisma migration.',
      );
    }

    console.log(
      'Upgrade preserved calendars, break policies, historical snapshots, and terminal timezone; all Prisma migrations finished.',
    );
  }
} finally {
  await client.end();
}
