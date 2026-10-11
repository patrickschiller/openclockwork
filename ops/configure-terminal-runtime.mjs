import { Client } from 'pg';

// Run with the migration owner's connection; never give its credentials to API.
async function main() {
  const role = process.env.TERMINAL_RUNTIME_DB_ROLE ?? 'openclockwork_runtime';
  const password = process.env.TERMINAL_RUNTIME_DB_PASSWORD;
  if (
    !/^[a-z][a-z0-9_]{0,62}$/.test(role) ||
    !password ||
    password.length < 20 ||
    !process.env.DATABASE_URL
  )
    throw new Error('Invalid runtime role configuration');
  const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';
  const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL standard_conforming_strings = on');
    const {
      rows: [{ database, owner }],
    } = await client.query(
      'SELECT current_database() AS database, current_user AS owner',
    );
    if (owner === role) throw new Error('Use the separate migration owner');
    const existing = await client.query(
      'SELECT 1 FROM pg_roles WHERE rolname = $1',
      [role],
    );
    if (!existing.rowCount)
      await client.query(
        `CREATE ROLE ${identifier(role)} LOGIN PASSWORD ${literal(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
      );
    else
      await client.query(
        `ALTER ROLE ${identifier(role)} LOGIN PASSWORD ${literal(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
      );
    // Fail if the proposed runtime has ownership or inherited owner privileges.
    // Shared dependencies include schema/database/function ownership as well as
    // tables. A schema owner could otherwise DROP SCHEMA ... CASCADE the audit.
    const ownership = await client.query(
      "SELECT 1 FROM pg_shdepend d JOIN pg_roles r ON r.oid=d.refobjid WHERE d.refclassid='pg_authid'::regclass AND d.deptype='o' AND r.rolname=$1 LIMIT 1",
      [role],
    );
    const memberships = await client.query(
      'SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=$1 LIMIT 1',
      [role],
    );
    if (ownership.rowCount || memberships.rowCount)
      throw new Error('Runtime must not own objects or inherit roles');
    await client.query(
      `GRANT CONNECT ON DATABASE ${identifier(database)} TO ${identifier(role)}`,
    );
    await client.query(`GRANT USAGE ON SCHEMA public TO ${identifier(role)}`);
    await client.query(
      `REVOKE CREATE ON SCHEMA public FROM ${identifier(role)}`,
    );
    const schemaRights = await client.query(
      "SELECT has_schema_privilege($1, 'public', 'CREATE') AS unsafe",
      [role],
    );
    if (schemaRights.rows[0].unsafe)
      throw new Error(
        'Runtime inherits public schema CREATE; remove that grant before setup',
      );
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${identifier(role)}`,
    );
    await client.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${identifier(role)}`,
    );
    await client.query('REVOKE ALL ON "TerminalAuditEvent" FROM PUBLIC');
    await client.query(
      `REVOKE ALL ON "TerminalAuditEvent" FROM ${identifier(role)}`,
    );
    await client.query(
      `GRANT SELECT, INSERT ON "TerminalAuditEvent" TO ${identifier(role)}`,
    );
    await client.query(
      `REVOKE ALL ON "_prisma_migrations" FROM ${identifier(role)}`,
    );
    // Repeat after every deployment so newly added tables receive explicit grants.
    await client.query('COMMIT');
    console.log(
      'Terminal runtime role configured with append-only audit permissions',
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error(
    'Runtime role configuration failed; use a separate migration owner and check the role.',
  );
  process.exitCode = 1;
});
