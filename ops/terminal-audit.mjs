import { readFile, writeFile } from 'node:fs/promises';
import { Client } from 'pg';
import {
  auditKeys,
  snapshotDigest,
  verifyAudit,
} from './terminal-audit-chain.mjs';

async function main() {
  const [command, file, anchorFile] = process.argv.slice(2);
  if (
    !file ||
    !['export', 'verify', 'anchor'].includes(command) ||
    (command === 'anchor' && !anchorFile)
  )
    throw new Error(
      'Usage: terminal-audit.mjs export FILE | verify FILE [ANCHOR] | anchor FILE ANCHOR',
    );
  const keys = auditKeys();
  if (command === 'export') {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const {
        rows: [{ database }],
      } = await client.query('SELECT current_database() AS database');
      // Prisma stores UTC instants in TIMESTAMP WITHOUT TIME ZONE. Convert to
      // timestamptz explicitly so pg does not interpret them in the CLI's TZ.
      const { rows: events } =
        await client.query(`SELECT "sequence", "id", "occurredAt" AT TIME ZONE 'UTC' AS "occurredAt",
        "event", "result", "method", "action", "employeeId", "actorId", "terminalId", "deviceId",
        "terminalName", "locationLabel", "timeEntryId", "canonicalPayload", "previousHash", "hash", "keyVersion"
        FROM "TerminalAuditEvent" ORDER BY "sequence"`);
      await client.query('COMMIT');
      const last = events.at(-1);
      const snapshot = {
        format: 1,
        database,
        exportedAt: new Date().toISOString(),
        head: {
          sequence: last?.sequence ?? '0',
          hash: last?.hash ?? '0'.repeat(64),
        },
        events,
      };
      verifyAudit(snapshot, keys);
      await writeFile(file, JSON.stringify(snapshot, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
      console.log(`Audit export verified: ${snapshot.head.sequence} events`);
    } finally {
      await client.end();
    }
    return;
  }
  const content = await readFile(file, 'utf8');
  const snapshot = JSON.parse(content);
  const anchor =
    command === 'verify' && anchorFile
      ? JSON.parse(await readFile(anchorFile, 'utf8'))
      : undefined;
  const head = verifyAudit(snapshot, keys, anchor);
  if (command === 'anchor') {
    // The destination must be independently retained by the operator. File mode
    // alone is a local test adapter and does not provide WORM protection.
    await writeFile(
      anchorFile,
      JSON.stringify(
        {
          format: 1,
          database: snapshot.database,
          anchoredAt: new Date().toISOString(),
          head,
          snapshotSha256: snapshotDigest(content),
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o444 },
    );
    console.log(`Audit anchor created: ${head.sequence} events`);
  } else
    console.log(
      `Audit verified: ${head.sequence} events${anchor ? ', external anchor matched' : ''}`,
    );
}

main().catch(() => {
  console.error(
    'Terminal audit operation failed; check the target, key versions and audit integrity.',
  );
  process.exitCode = 1;
});
