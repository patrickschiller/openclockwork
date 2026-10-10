# Upgrading OpenClockwork

OpenClockwork 2.0.0 is a deliberately chosen product-generation milestone;
its major version does not imply that every 1.4.0 Team integration is
incompatible. Subsequent releases follow semantic versioning according to
their documented compatibility impact. Read the release notes for the target
version and every skipped version before upgrading. A release may call out
required intermediate versions or manual steps.

For 2.0.0, also read [operating modes](docs/OPERATING_MODES.md),
[Solo mode](docs/SOLO_MODE.md) and [Team mode](docs/TEAM_MODE.md). This major
version introduces Solo alongside the existing Team product. It does not
require a fresh database or an automatic conversion to Solo.

The production Docker Compose stack keeps PostgreSQL data in the named volume
`openclockwork-db-data-prod` and local request attachments in
`openclockwork-attachments-prod`. `docker compose up -d` replaces application
containers without deleting either volume. Keep `OPENCLOCKWORK_DB_VOLUME` and
`OPENCLOCKWORK_ATTACHMENTS_VOLUME` unchanged in `.env.prod` across upgrades.

The example volume names are not a backup or a deletion lock. Its named volumes
are Compose-managed unless you explicitly configure them as external. A custom
deployment can use separately provisioned `external: true` volumes to keep
Compose from managing their deletion, but this does not protect against manual
volume removal, pruning unused volumes, Docker data loss or host failure. Do
not replace a populated installation's volume with a new name during an upgrade.

## Required for 2.0.1

Version 2.0.1 fixes read access in Team mode to personnel records, time accounts, vacation
balances, leave allowances, absences and working-time violations. Updating
existing installations is recommended. From 2.0.0,
this update adds no database migrations and requires no seed or reset.
Keep the existing data, volumes, configuration and working timezone, take a
consistent backup, and deploy matching 2.0.1 API/web images as described below.

Custom API clients must handle `401` and `403` responses and the scoped
`GET /api/employees` list. Use the authenticated `GET /api/employees/directory`
names/IDs response for substitute and project-assignment selectors instead
of reading full personnel records. Personnel, account, vacation-balance,
`GET /api/employees/:employeeId/leave-allowances`, `GET /api/absences` and
`GET /api/violations` reads require authentication and remain within the
actor's own data, direct reports or HR administrator scope. Unfiltered absence
lists are scoped too; explicit unauthorized employee filters are rejected.
See the updated [OpenAPI contract](apps/api/openapi.json).

When upgrading from a version older than 2.0.0, also follow the 2.0.0
requirements below and the release notes for every skipped version.

## Required for 2.0.0

### Existing 1.4.0 installations

- Upgrade directly from 1.4.0; no intermediate 1.5.0 release or reseed is needed.
  Existing installations remain **Team**, with setup marked complete and no
  invented Solo owner. Employee, project, time, leave and terminal identities
  and existing historical policy snapshots are retained.
- **Retain the installation's explicit working `TZ`.** For example, keep
  `Europe/Berlin` if that is the timezone used by the existing data. A new
  deployment's UTC default is not an instruction to change an existing one.
  Keep the equivalent API/job timezone setting in Azure as well.
- The new time-entry metadata starts neutral: `billable=false`, `revision=0`,
  `voidedAt=null`, `captureGroupId=null` and `approvalMode=null`. Existing Team
  work is not relabelled as self-approved Solo work or retrospectively grouped
  for a different break calculation.
- Preserve the same application secrets unless deliberately rotating them.
  Password changes and administrator/recovery resets invalidate the affected
  employee's previous access/refresh sessions; plan to sign in again.
- New Solo revisions and timer identifiers are mode-specific requirements,
  not newly mandatory fields for every existing Team request. Check the
  [OpenAPI contract](apps/api/openapi.json) for the operations your integration
  uses. Handle revoked sessions and revision conflicts explicitly.

### Five forward migrations

The upgraded API runs the following pending migrations before serving traffic:

| Migration                              | Operational effect                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260908120000_solo_mode`             | Adds installation mode/settings/events, personal policies/days, customers and time-entry audit records; project/customer and billable defaults; service-order billable inheritance; time-entry revision, void, capture-group and approval-mode metadata. Updates constraints to account for voided work and initializes existing installations as Team. |
| `20260908130000_solo_session_version`  | Adds the employee session version with a zero default; older versionless tokens are interpreted as version zero until a password/session-version change invalidates them.                                                                                                                                                                               |
| `20260908140000_solo_leave_versions`   | Adds allowance-year-specific carry-over, expiry and reasoned adjustments to Solo policy versions.                                                                                                                                                                                                                                                       |
| `20260908150000_solo_personal_windows` | Adds personal frame/core-time settings and database checks for their stored representation.                                                                                                                                                                                                                                                             |
| `20260908160000_solo_required_target`  | Tightens the target constraint: an enabled personal target requires a non-null value greater than zero and no more than 10,080 weekly minutes.                                                                                                                                                                                                          |

These are forward migrations, not a database replacement. Do not edit or delete
already applied migration files. If a development/preview installation contains
invalid custom data and a constraint fails, stop the upgrade, inspect the
failure and correct it deliberately with a recoverable plan. Do not drop the
constraint or reset the database to make startup appear successful.

### Choosing Solo without losing Team history

An administrator can explicitly preview and request a mode change after the
upgrade. Open timers block a transition; entering Solo also requires resolving
other active employees, pending requests/time approvals and active terminals.
Existing records and IDs remain. Eligible active projects are assigned to the
owner, and the first personal policy for an existing worker may inherit their
current target/leave/calendar/break settings; review it before recording more
work. Fresh Solo defaults, by contrast, leave optional features disabled.

The live access mode changes immediately. Accounting changes use an explicit
effective date; if today's working-timezone day already has effective work or
time off, the change starts on the next calendar day. Personal rule versions
also protect past/recorded days. Do not change timestamps or system clocks to
bypass that protection. Switch to Team before adding another active employee.

Only run initial-owner/administrator bootstrap on an empty employee table.
It is not an upgrade or recovery step for an existing installation. If creating
a separate new production Solo installation, provision its own database,
credentials, network and persistent volumes rather than deleting a development
or acceptance database. Use the normal Solo bootstrap, not a demo seed or a
historical test fixture. Keep the production database off published host ports.

## 1. Prepare and back up

Record the current API/web image versions or digests, PostgreSQL major version,
Compose project name, exact Compose file set, volume names, working timezone and
attachment backend. Resolve the actual running resources before issuing any
command; a different project name or omitted override can select a different
installation. Production credentials must not be copied into the development
checkout's `.env`, E2E configuration or a globally exported `DATABASE_URL`.

Choose a protected backup directory **outside both the source checkout and
Docker-managed storage**. Use unique timestamped backup sets; do not overwrite
the previous recovery point. Database dumps contain personal data, and copied
configuration contains secrets. Restrict filesystem access, encrypt retained
backups, keep an off-machine copy and store recovery keys separately. The
application does not automatically configure those services for you.

For a consistent database/attachment pair, pause all writers: browser/API
traffic, scheduled jobs, imports, integrations and any direct database writers.
The example below stops the standard web/API services but leaves PostgreSQL
running for its consistent logical dump. Stop any additional writer separately.
Do not treat a running timer as automatically stopped by a container restart;
coordinate the maintenance window with users.

The following commands assume the standard local attachment mount
`/app/data/attachments`. Run them in a dedicated shell, supplying the **existing**
deployment's values; do not use development/test Compose files. If multiple
Compose files are required, include all of them in the `oc` function in the same
order as the deployed stack.

```bash
set -eu
umask 077

: "${OC_PROJECT:?Set the existing Compose project name}"
: "${OC_COMPOSE_FILE:?Set the absolute path to the existing production Compose file}"
: "${OC_ENV_FILE:?Set the absolute path to its private environment file}"
: "${OC_BACKUP_ROOT:?Set an existing protected absolute directory outside the checkout and Docker storage}"

oc() {
  docker compose -p "$OC_PROJECT" -f "$OC_COMPOSE_FILE" \
    --env-file "$OC_ENV_FILE" "$@"
}

oc ps
oc images
oc_backup_dir="$(mktemp -d "$OC_BACKUP_ROOT/openclockwork-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"

oc stop web api

oc exec -T db sh -c \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "$oc_backup_dir/database.dump"

# The one-off command only archives files: it does not start the API,
# run migrations or start its dependencies. Existing images are reused.
oc run --rm --no-deps --pull never -T --entrypoint tar api \
  -czf - -C /app/data attachments \
  > "$oc_backup_dir/attachments.tar.gz"

# These files contain secrets. Keep the whole backup set private.
cp "$OC_ENV_FILE" "$oc_backup_dir/deployment.env"
oc config > "$oc_backup_dir/compose.resolved.yml"
oc images > "$oc_backup_dir/images.txt"

# Readability checks are useful, but do not replace a restore test.
oc exec -T db pg_restore --list < "$oc_backup_dir/database.dump" \
  > "$oc_backup_dir/database-toc.txt"
tar -tzf "$oc_backup_dir/attachments.tar.gz" > /dev/null
```

If `STORAGE_BACKEND=azure-blob` is configured, back up the Azure container
with its provider-supported backup/versioning procedure **instead of** the
local attachment command. Preserve a matching database recovery point and
keep all relevant writers paused while establishing the pair. Back up any
external secret references and additional PostgreSQL roles required for recovery;
`pg_dump` is a database dump, not a complete cluster/role or point-in-time backup.

Do not proceed after a failed dump, archive or validation. The files produced
above are local, unencrypted backup material until protected by your chosen
encryption/backup system. Complete the encrypted off-machine copy and record
checksums, versions and capture time. Retain earlier backup generations.

### Test restoration before relying on the backup

Restore into a **separate empty database/volume and attachment target**, using
the compatible PostgreSQL major version and the pre-upgrade application image.
Do not test by overwriting the live database. Restore the required database
owner/roles, run `pg_restore` with error checking, then restore the matching
attachment archive with the correct application ownership/permissions. Keep
this recovery environment private and disconnected from real email, terminals,
scheduled jobs and integrations.

Check migrations, IDs and representative full record values, time/leave
history, policy snapshots, logins and attachment readability. Record which
backup set was restored and the outcome. A successful dump exit code alone
does not establish recoverability. Encrypted backups are useful only if their
decryption keys and configuration can also be recovered.

## Required when adding QR terminal support

Before starting a release that contains the tablet terminal feature, add a new
independent secret to `.env.prod`:

```dotenv
TERMINAL_QR_SECRET=replace-with-an-independent-random-value-of-at-least-32-characters
```

Do not reuse `JWT_SECRET`. The production Compose file intentionally refuses to
start without this value because it derives pairing and rotating QR material.
Store it with the same backup and access controls as the other application
secrets. Azure deployments must likewise set the secure
`terminalQrSecret` Bicep parameter (for example in an untracked private
parameter file); the deployment stores it as a separate Key Vault secret.

Existing releases from 1.2.0 onward also harden the live-booking API. `GET /api/timeentries`,
`POST /api/timeentries/clock-in`, and `POST /api/timeentries/clock-out` now
require an employee bearer token. Clock-in/out always use the employee identity
from that token; a legacy `employeeId` in the request body is ignored. Update
external clients before rollout and regenerate them from
`apps/api/openapi.json` where applicable.

## Required for 1.3.0

All employee-directory and request-workflow endpoints now require a JWT bearer
token. Request creation, approval, rejection, substitution, cancellation, and
bulk operations derive the acting employee from that token instead of trusting
`employeeId` or `actorId` in a request body. Update external clients to
authenticate these calls and use the regenerated OpenAPI contract before the
rollout.

Release 1.3.0 adds nullable clock-in and clock-out terminal-location snapshots
to `TimeEntry`. The forward migration backfills labels for entries that still
reference a terminal. No manual SQL is required; normal API startup applies the
migration before serving traffic.

## Required for 1.4.0

The migration `20260907120000_international_work_policies` introduces explicit
holiday calendars, custom holiday dates, and configurable automatic break
deductions. Normal API startup applies it before serving traffic. Back up the
installation and explicitly retain its working timezone before deploying 1.4.0.

- Existing employee state selections become the equivalent `DE-XX` calendar.
  Existing German calendar behaviour remains in place. New employees default
  to `holidayCalendar: "NONE"` and an empty `holidayDates` list.
- Existing schedules retain the previous 360-minute/30-minute and
  540-minute/45-minute deduction thresholds. If employees previously relied on
  an implicit schedule and no default schedule exists, the migration assigns
  them an explicit schedule preserving that policy. New schedules default to
  an empty `breakRules` list.
- Existing time entries receive a snapshot of the previous deduction policy.
  New entries capture the active schedule policy; changing a schedule later
  does not recalculate those stored entries' break deductions.
- External clients should use `holidayCalendar` and `holidayDates`. The
  deprecated `bundesland` field remains accepted for German state selections;
  responses can now return `null` there. Conflicting legacy and canonical calendar
  selections are rejected. Regenerate clients from `apps/api/openapi.json` and
  configure new schedule `breakRules` explicitly where deductions are required.
  Persisted time-model enum identifiers remain compatible; the UI translates
  their labels.
- Bootstrap and employee forms no longer assume a 30-day leave entitlement.
  Enter the contractual allowance explicitly. Existing allowances are retained.
- Docker and Azure defaults become `UTC`. **Set `TZ` explicitly to your existing
  working timezone before upgrading**, especially if you previously relied on
  the implicit `Europe/Berlin` default. For Azure, set the `timeZone` parameter
  for both the API and scheduled job. Existing terminal display timezones stay
  unchanged.

Review calendars and break policies after the upgrade. Custom holidays are
explicit dates rather than recurring rules: supply each relevant year. The API
still uses one deployment working timezone for day and schedule boundaries.

## Development, test and demo maintenance

Version 2.0.0 deliberately tightens repository maintenance commands. This is
separate from the data-preserving production `prisma migrate deploy` startup.
The project guards fail closed for `NODE_ENV=production`, unclassified database
names, unsupported/ambiguous connection settings and non-`public` schemas.
They do not control a database administrator, a directly invoked Prisma/SQL
command or Docker volume deletion.

| Command / operation         | Required non-production configuration                                                                                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API E2E                     | `E2E_DATABASE_URL` is required. Its database must be `openclockwork_test` or that name followed by underscore-separated lowercase alphanumeric suffixes, such as `openclockwork_test_upgrade`. If `DATABASE_URL` is also set, it must identify the same canonical connection. |
| E2E database administration | `E2E_ADMIN_DATABASE_URL` is optional; otherwise it is derived from the test connection using the `postgres` database. An explicit admin connection must use the same host/port and the `postgres` database.                                                                   |
| `pnpm db:seed`              | A classified `openclockwork_dev`, `openclockwork_demo` or `openclockwork_test` database, optionally with lowercase alphanumeric underscore-separated suffixes, plus `OPENCLOCKWORK_SEED_CONFIRM_DATABASE` exactly matching its database name.                                 |
| `pnpm db:reset`             | The same classified target rules, plus `OPENCLOCKWORK_RESET_CONFIRM_DATABASE` exactly matching its database name. This remains destructive, accepts no pass-through CLI flags and no longer seeds automatically after resetting.                                              |
| `pnpm db:demo-reset`        | The classified target and reset confirmation above, plus `DEMO_RESET_ENABLED=true` and `DEMO_RESET_CONFIRMATION=DELETE-AND-RESEED-OPENClockwork-DEMO`. Its subsequent seed uses the already verified target.                                                                  |

E2E checks run before application initialization and again before table
truncation, including a check of the actual connected database/schema. Seed
and demo-reset also verify their connected database before writes. Nevertheless,
a name/confirmation is only a guardrail: do not put real data into a disposable
test/demo database or expose production credentials to a test process.

If an existing local development database is named simply `openclockwork`, it
is intentionally not a valid destructive maintenance target. Do not rename,
reset or repurpose it to satisfy a check. Keep it and provision a separate
explicitly disposable dev/test/demo database when needed. Remove inherited
production `DATABASE_URL` values from the test shell and set the test connection
per invocation. No default test URL is assumed anymore.

The development Compose stack no longer seeds automatically and defaults
`DEMO_MODE` to `false`. Creating synthetic demo data is now an explicit,
separately confirmed maintenance operation on a disposable database.

An older Azure demo-reset job using `NODE_ENV=production` and a generic
`openclockwork` database will now refuse to run. Disable or replace that job
with a deliberately isolated non-production demo lifecycle and its explicit
opt-ins. Do not weaken the production environment or rename a production
database to make a reset job pass. Review CI, local scripts and scheduled demo
jobs before relying on their next run. Normal production upgrades do not
require any seed/reset opt-in.

The Azure template's optional `postgresDatabaseName` keeps the existing generic
name as its default; it does not rename existing databases. For a deliberately
new disposable demo deployment, follow the [Azure deployment guide](infra/azure/README.md)
to select a classified name and opt in to its maintenance job. Only that job
runs in a non-production runtime; the API retains its production runtime.

## 2. Select and pull the release

Set `OPENCLOCKWORK_VERSION` in `.env.prod` to the exact version from the GitHub
Release, **`2.0.1` for this upgrade**, only after preserving the old configuration
in the backup set. Pin matching API/web versions or verified digests. Do not use
`latest`, a mutable `:local` image, or a source-build override for an unattended
production upgrade. Keep the same PostgreSQL major version; a PostgreSQL major
upgrade is a separate procedure, not an application-image update.

Use the `oc` function and exact deployment configuration selected in step 1:

```bash
oc pull api web
```

## 3. Apply the update

```bash
oc up -d
```

The API waits for PostgreSQL and runs `prisma migrate deploy` before starting.
Prisma records applied migrations in `_prisma_migrations` and skips them on
subsequent starts. Production startup never seeds or resets the database.
If API/web are deployed independently, deploy the API first, wait for its
health endpoint to report `2.0.1`, then deploy the matching web image. The web
startup version check is not a promise of zero-downtime mixed-version operation;
keep additional writers paused until verification completes.

Do not run any of the following during an upgrade:

```text
docker compose down -v
prisma migrate reset
pnpm db:reset
pnpm db:demo-reset
pnpm db:seed
docker volume prune --all
```

Do not remove existing volumes manually or change their names. Neither a clean
development database nor a successful test run authorizes deletion of an
existing installation. Keep production isolated from demo/reset workflows.

## 4. Verify the installation

```bash
oc ps

oc exec -T api ./node_modules/.bin/prisma migrate status

oc exec -T api wget -qO- http://127.0.0.1:3000/api/health
```

Confirm `2.0.1` through the public web/proxy health route as well as the
container check. Sign in and verify the actual deployed mode, a known employee,
an existing time entry, historic break totals, leave balances and configured
attachment storage. A 1.4.0 upgrade must still be Team unless an administrator
has explicitly switched it. Reopen old PWA/browser tabs if they show a cached
bundle, and verify that exports/printing work in the browsers you operate.

For an intentional Solo transition, verify the owner, inherited or deliberately
disabled personal rules, customer/project eligibility, timer state and history.
Confirm existing records remain accessible in their intended mode. Do not
substitute a synthetic fixture's expected values for the installation's real
baseline. Resume scheduled jobs and integrations only after the selected
backup, migration, identity and functional checks succeed.

## Rollback

Application containers can only be changed back to an earlier
`OPENCLOCKWORK_VERSION` when the release notes explicitly declare the database
compatible with that version. Forward migrations are not automatically
reversed. **2.0.0 does not declare its migrated database backward-compatible
with 1.4.0 application binaries.** Do not simply point an older API at it.

For a full rollback:

1. Stop all writers and record the failure, current images and migration state.
   Preserve the failed database/attachments; do not erase the evidence.
2. Restore the matching pre-upgrade database, attachments and protected
   configuration into a separate empty recovery target, using the previous
   application version and a compatible PostgreSQL version. Keep its external
   integrations disabled while checking it.
3. Verify identities, representative historical values, balances and attachment
   access. Confirm the recoverable backup point and explicitly account for any
   changes made after that point; restoring does not merge later work.
4. Perform a deliberate, documented cutover to the verified recovery target.
   Only overwrite or delete an existing target under an explicitly authorized
   incident plan. Keep the original state and older backups until the recovery
   has been accepted and retention requirements allow cleanup.

This procedure is not automatic rollback or point-in-time recovery. Backup
frequency, off-machine storage, encryption, retention, alerting and recovery
objectives must be configured and tested by the operator.

## Migration policy for contributors

- `prisma/schema.prisma` and committed migrations are the database source of
  truth.
- Never edit a migration that has already reached `main`; add a new migration.
- Prefer expand/contract changes when old and new application versions may
  overlap during deployment.
- Backfill existing rows before adding a required constraint that they do not
  yet satisfy.
- Every schema-changing pull request must pass the Base-to-Head upgrade test
  with existing sentinel data.
