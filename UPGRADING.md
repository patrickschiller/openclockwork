# Upgrading OpenClockwork

OpenClockwork releases use semantic versioning. Read the release notes for the
target version and every skipped version before upgrading. A release may call
out required intermediate versions or manual steps.

The production Docker Compose stack keeps PostgreSQL data in the named volume
`openclockwork-db-data-prod` and local request attachments in
`openclockwork-attachments-prod`. `docker compose up -d` replaces application
containers without deleting either volume. Keep `OPENCLOCKWORK_DB_VOLUME` and
`OPENCLOCKWORK_ATTACHMENTS_VOLUME` unchanged in `.env.prod` across upgrades.

## 1. Prepare and back up

Run these commands from the directory that contains the existing `.env.prod`.
Keep backups outside Docker volumes and test their restoration regularly.

```bash
mkdir -p backups

docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > backups/openclockwork-before-upgrade.dump

docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T api tar -czf - -C /app/data attachments \
  > backups/openclockwork-attachments-before-upgrade.tar.gz
```

If `STORAGE_BACKEND=azure-blob` is configured, back up the Azure container
according to the organisation's storage policy instead of using the attachment
command above.

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

## 2. Select and pull the release

Set `OPENCLOCKWORK_VERSION` in `.env.prod` to the exact version from the GitHub
Release, for example `1.4.0`. Do not use `latest` for a controlled production
upgrade.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
```

## 3. Apply the update

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

The API waits for PostgreSQL and runs `prisma migrate deploy` before starting.
Prisma records applied migrations in `_prisma_migrations` and skips them on
subsequent starts. Production startup never seeds or resets the database.

Do not run any of the following during an upgrade:

```text
docker compose down -v
prisma migrate reset
pnpm db:reset
pnpm db:demo-reset
```

## 4. Verify the installation

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T api ./node_modules/.bin/prisma migrate status

curl --fail http://localhost:${WEB_PORT:-8080}/api/health
```

Sign in and verify a known employee, an existing time entry, and any configured
attachment storage before considering the upgrade complete.

## Rollback

Application containers can only be changed back to an earlier
`OPENCLOCKWORK_VERSION` when the release notes explicitly declare the database
compatible with that version. Forward migrations are not automatically
reversed.

For a full rollback, stop application traffic, restore the database backup and
attachment backup, set the previous version in `.env.prod`, and start the stack
again. Restoring overwrites current data, so follow the organisation's incident
and backup procedures rather than attempting an ad-hoc reverse migration.

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
