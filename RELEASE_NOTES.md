# OpenClockwork v1.3.0

## Highlights

- Adds an HR opt-in for clock-in and clock-out locations in the
  project-independent working-time report and its CSV export. Location data is
  excluded from report responses by default.
- Combines available GPS coordinates and accuracy with durable terminal
  location labels. Terminal labels are captured at booking time so historical
  reports remain stable after a terminal is renamed or deleted.
- Secures employee-directory and request-workflow APIs with bearer
  authentication. Request actors and employees are derived from the
  authenticated session instead of client-supplied identity fields.
- Extends regression coverage for location reporting, terminal deletion,
  authenticated workflow transitions, database upgrades, and generated API
  contracts.

## Upgrade notes

- Back up PostgreSQL and request attachments before upgrading.
- Set `OPENCLOCKWORK_VERSION=1.3.0` and follow the
  [upgrade guide](https://github.com/patrickschiller/openclockwork/blob/v1.3.0/UPGRADING.md).
- Existing production volumes are retained; do not use `docker compose down -v`.
- Update external integrations that call employee or request endpoints: they
  must send a valid JWT bearer token and must not rely on request-body
  `employeeId` or `actorId` values to select the acting user.
- When API and web are deployed separately, deploy the `1.3.0` API first and
  wait for `/api/health` to report version `1.3.0`; then deploy the web image.
  Docker Compose performs this ordering automatically.

## Database migrations

- `20260901120000_working_time_report_locations` adds nullable terminal location
  label snapshots for clock-in and clock-out and backfills existing
  terminal-linked entries where possible.
- The migration is additive and contains no destructive schema change.

## Breaking changes

- All `/api/employees` and `/api/requests` endpoints now require bearer
  authentication. Workflow identity is taken from the authenticated token;
  unauthenticated calls and attempts to select another actor through request
  bodies are rejected or ignored as appropriate.

## Docker images

- `ghcr.io/patrickschiller/openclockwork-api:1.3.0`
- `ghcr.io/patrickschiller/openclockwork-web:1.3.0`

## Known issues

None known.
