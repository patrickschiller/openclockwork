# OpenClockwork v2.0.1

## Security fix

- Fixes read authorization in Team mode for personnel records, time accounts, vacation
  balances, leave allowances, absences and working-time violations in
  [PR #34](https://github.com/patrickschiller/openclockwork/pull/34), following a
  finding from Codex Security Cloud. Employee lists and individual personnel
  records now follow the authenticated actor's permitted scope. The related
  account, vacation-balance, leave-allowance, absence and violation reads require
  authentication and enforce access to the actor's own data, their direct reports
  or the HR administrator's permitted scope. Absence lists without an employee
  filter are scoped as well; an explicit unauthorized employee filter is rejected.
- Keeps substitute selection and project assignment working through an
  authenticated employee directory containing only IDs, first names and last
  names. These selectors no longer require the full personnel-record list.
- Updating existing installations to 2.0.1 is recommended. See the
  [security advisory](https://github.com/patrickschiller/openclockwork/security/advisories/GHSA-4f2x-4pf8-wwx6)
  for affected endpoints and mitigation.

## Upgrade and compatibility

- There are no new database migrations when upgrading from 2.0.0. Keep the
  existing database, attachment volumes, identities, configuration and working
  timezone. Do not seed or reset an existing installation for this update.
  When upgrading from an older release, also follow its intervening migration
  and upgrade requirements.
- Read the [upgrade guide](https://github.com/patrickschiller/openclockwork/blob/v2.0.1/UPGRADING.md)
  and take a consistent backup before updating. Deploy matching API and web
  images. If deploying them separately, deploy the API first and wait for
  `/api/health` to report `2.0.1`, then deploy the web image. Reopen existing PWA
  or browser tabs if they continue using a cached bundle.
- Custom API clients must handle `401` and `403` responses and must not assume
  `GET /api/employees` exposes every employee's personnel record. Use
  `GET /api/employees/directory` for names and IDs needed by substitute and
  project-assignment selectors. Keep personnel, account, vacation-balance,
  `GET /api/employees/:employeeId/leave-allowances`, `GET /api/absences` and
  `GET /api/violations` reads authenticated and within the actor's permitted
  scope. Consult the
  [OpenAPI contract](https://github.com/patrickschiller/openclockwork/blob/v2.0.1/apps/api/openapi.json)
  for the updated directory response.

## Docker images

- `ghcr.io/patrickschiller/openclockwork-api:2.0.1`
- `ghcr.io/patrickschiller/openclockwork-web:2.0.1`

The release workflow also updates each image's `latest` tag. Pin `2.0.1` or a
verified digest for production and use the same release for both images.

# OpenClockwork v2.0.0

OpenClockwork 2.0 introduces two explicit ways to run the same application:
**Solo** for one person's work and customer time, and **Team** for established
employee, schedule, leave and approval workflows. This is a product-generation
major release, not a replacement of the existing Team application.

Existing 1.4.0 installations can upgrade directly: their data and identities are
retained, they stay in Team mode, and no Solo owner is invented. The new Solo
contracts and deliberately stricter maintenance tools are described below;
existing Team requests are not universally required to adopt Solo-only fields.

## Highlights

- A focused Solo workspace with authenticated owner setup, personal overview,
  timer, time history, calendar, customers, projects, reports and settings.
- One shared timer across browser sessions, atomic project switching, manual
  entries, corrections with reasons, cancellation and auditable history.
- Stable automatic break deduction across a capture group: splitting work or
  changing project does not restart the break threshold or deduct the same
  break twice. Calculations retain sub-minute precision.
- Customer and internal project allocation, service orders, billable time,
  filtered gross/break/net reports, CSV and printable customer statements.
- Optional, effective-dated personal targets, leave accounts and carry-over,
  holiday dates, break rules, daily target blocks, GPS and frame/core-time hints.
- Stronger session validation, protected last-administrator changes and
  conflict-aware updates, while preserving the existing Team data model's history.
- Separate public guides for
  [choosing an operating mode](https://github.com/patrickschiller/openclockwork/blob/v2.0.0/docs/OPERATING_MODES.md),
  [Solo mode](https://github.com/patrickschiller/openclockwork/blob/v2.0.0/docs/SOLO_MODE.md)
  and [Team mode](https://github.com/patrickschiller/openclockwork/blob/v2.0.0/docs/TEAM_MODE.md).

## Solo and Team workflows

### A personal workspace without fabricated HR processes

- A fresh Solo installation has one active owner. New Solo targets, leave
  accounting, break deductions, daily blocks, GPS and personal hints start
  disabled; enable only the rules you intend to use. Owner setup does not
  require an employee-management matrix or a manager approval workflow.
- Start, switch and stop the personal timer, or enter a completed interval
  manually. Future completed work and overlapping effective intervals are
  rejected. Corrections require a reason; cancellation retains the record and
  its history while removing its effect on totals.
- Personal days support free time, vacation, sickness and training, including
  half-day boundaries, editing, cancellation and history. These are direct
  personal records rather than requests sent to an imaginary approver.
- The interface supports English and German, light/dark themes, responsive
  layouts, keyboard-accessible confirmation dialogs and explicit pending/error
  states. Customer statements have a dedicated print layout, usable with the
  browser's print or Save as PDF function.

### Deliberate mode transitions

- Team retains employee administration, work schedules, leave requests,
  approvals, accounts and terminal workflows. Upgrade alone does not disable
  them or convert past Team entries into Solo entries.
- Administrators preview a mode change before applying it. Open timers block
  switching; entry into Solo also requires resolving other active employees,
  pending requests/time approvals and active terminals.
- Transitions preserve identities and records. Eligible active projects are
  assigned to the Solo owner without requiring a separate assignment step.
  Switch to Team before adding another active employee.
- Access mode changes immediately. If the current working-timezone day already
  contains effective work or time off, the accounting-mode change starts on
  the following calendar day. Its effective date is recorded so switching
  access mode does not rewrite that day's targets or leave treatment.
- Solo restrictions are enforced by the API, not merely hidden navigation:
  Team/HR routes and another person's private data do not become available by
  guessing a URL.

## Personal rules, precision and historical accounting

- Personal policies are versioned by effective date. Past policy changes are
  rejected, and a day with recorded accounting activity is protected against
  replacement by a new same-day policy. Future versions remain visible in
  settings. Existing time entries retain their captured break rules.
- A weekly target is distributed over the configured working days. Work from
  periods before target activation, or after its deactivation, is not silently
  turned into overtime. Historical mode and policy versions determine which
  work and targets belong in the account.
- Leave supports an annual base, explicit carry-over, optional carry-over
  expiry, and reasoned positive or negative adjustments tied to an allowance
  year. Only unused carry-over expires; consumed carry-over is not deducted
  again, and year-specific carry/adjustments do not recur in the next year.
- Personal summaries account for half days, year boundaries and inherited
  approved Team leave/absence history without double-counting overlapping
  sources. Enabling an account does not apply today's rules indiscriminately
  to earlier personal days.
- Core-time and frame checks are personal hints, not approval requirements.
  They evaluate completed past days, omit open/current-day work and avoid
  inventing missing attendance on empty or excused days.
- Capture groups use actual elapsed time. Their total automatic break is
  shared proportionally across segments, including repeated splits and
  project changes. Legacy ungrouped Team entries retain their existing
  calculation behavior. Rounding is a presentation concern, so the sum of
  rounded display rows can differ slightly from a separately rounded total.
- Reports clip intervals at local day and period boundaries using UTC
  instants. The entry form rejects nonexistent local times and requires an
  explicit UTC-offset choice for ambiguous repeated times around daylight
  saving changes.

## Customers, billable work and private exports

- Customers can be linked to projects; internal work does not require a
  customer. Projects have a default billable flag, service orders can override
  it, and the selected billable value is recorded on each time entry.
- New Solo projects are assigned to their owner transactionally. Where a
  project has active service orders, a booking must select an active order.
  Archived customers/projects remain available in history but cannot receive
  new bookings; archiving a running timer's target is blocked. A booked
  project's customer cannot be silently reassigned.
- `GET /api/reports/solo` and `GET /api/reports/solo.csv` are owner-scoped and
  filter by period, customer, project, service order, billable status or
  unassigned work. They distinguish gross interval time, allocated breaks,
  net working time and billable net time.
- Open timers, rejected entries and cancelled/voided work are excluded from
  final totals. Filtering a segment does not recalculate its capture group's
  break threshold from only the visible subset.
- Customer reports include customer-facing activities but omit internal
  notes and location details. CSV exports use UTF-8 with a BOM, quoted
  semicolon-delimited fields, timezone/period metadata and protection against
  spreadsheet-formula interpretation of dangerous text prefixes. Print
  layout omits navigation, filters and internal administrative controls.
- The billable flag classifies time only: it does not set a price, calculate
  tax, create an invoice or establish a payment claim.

## Authentication, concurrency and API compatibility

- HTTP authentication and token refresh check the employee's current active
  state, role and session version instead of relying on a stale role claim.
  Password changes and administrative/recovery resets invalidate earlier
  access and refresh tokens. Legacy tokens without a version are treated as
  version zero and stop working after the employee's session version changes.
- Realtime connections reject refresh tokens, enforce access-token expiry and
  check current employee/session/owner eligibility. Authorization is checked
  again before broadcasts; invalid sessions are disconnected and Solo events
  do not expose another employee's activity. HTTP remains the source of truth.
- Concurrent administrator changes cannot demote or deactivate the last active
  administrator. Solo employee-management restrictions also apply inside
  write transactions, not only at the controller boundary.
- Updates to existing Solo time entries, timer switches/stops, personal days
  and installation settings use revision checks. Stopping a Solo timer also
  identifies the open entry; Solo range allocation supplies the affected
  entry IDs/revisions. Stale state returns a conflict instead of overwriting
  a newer change. Clients should reload and ask the user to retry deliberately.
- Solo-only requirements do not make those fields mandatory for every legacy
  Team operation. Integrators should use the regenerated
  [OpenAPI contract](https://github.com/patrickschiller/openclockwork/blob/v2.0.0/apps/api/openapi.json),
  handle authentication/conflict failures, and reauthenticate after password
  changes rather than retrying a revoked session.
- Initial-owner bootstrap works only with an empty employee table. A separate
  trusted-operator recovery command resets the existing active Solo owner's
  password without replacing their identity or history; it is not a general
  account-creation or mode-bypass mechanism.

## Database migrations from 1.4.0

All five forward migrations run through normal `prisma migrate deploy`:

| Migration                              | Purpose                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260908120000_solo_mode`             | Adds operating mode, installation settings/events, personal policy/day records, customers and time-entry audit history; adds project/customer and billable defaults, service-order inheritance, time-entry revision/void/capture-group/approval-mode fields, foreign keys and overlap/open-timer constraints. Existing installations receive a Team setting, not a Solo owner. |
| `20260908130000_solo_session_version`  | Adds `Employee.authVersion` with default zero for session invalidation.                                                                                                                                                                                                                                                                                                        |
| `20260908140000_solo_leave_versions`   | Adds explicit carry-over, expiry, adjustment/reason and allowance-year fields to personal policy versions.                                                                                                                                                                                                                                                                     |
| `20260908150000_solo_personal_windows` | Adds personal frame/core-time configuration and database validation of its stored shape.                                                                                                                                                                                                                                                                                       |
| `20260908160000_solo_required_target`  | Requires a non-null, positive, bounded weekly target whenever the personal target feature is enabled.                                                                                                                                                                                                                                                                          |

Existing employees, times, leave records and identifiers are retained. Historical
time entries receive neutral Solo metadata: non-billable, revision zero, no void
timestamp, no capture group and no Solo approval-mode classification. The new
migrations do not replace their existing 1.4.0 break snapshots or calendars.
No intermediate 1.5.0 release or demo reseed is required.

## Deployment, upgrade and rollback

- Read the [upgrade guide](https://github.com/patrickschiller/openclockwork/blob/v2.0.0/UPGRADING.md)
  before applying 2.0.0. Keep the current database/attachment volume identities,
  credentials and explicit working `TZ`; do not apply UTC merely because it
  is the default for a new installation.
- Pause writers and take a consistent database/attachment backup before the
  first upgraded API starts. Use unique timestamped destinations outside the
  checkout and Docker storage, protect configuration/secrets, encrypt backups,
  keep an off-machine copy, and test restoration into a separate empty target.
- Deploy matching API and web images, API first when deploying separately;
  wait for `/api/health` to report `2.0.0`. Existing PWA/browser tabs may need
  reopening after an update. Normal production startup migrates, never seeds
  or resets, but an image change can therefore trigger a schema migration.
- Do not run `docker compose down -v`, volume-pruning/removal commands, Prisma
  resets or demo seeds against production. Named volumes alone are not a
  backup or a deletion lock; external volumes protect against Compose-managed
  deletion, not a Docker administrator or loss of the host.
- A new production Solo installation should have its own project, credentials,
  network and persistent volumes, with no published database port. Existing
  development or acceptance data must not be erased to manufacture an empty
  installation. Production backup scheduling, encryption, off-machine storage
  and recovery policy remain operator responsibilities.
- Forward migrations are not automatically reversible. This release does not
  declare a migrated 2.0.0 database safe to run with 1.4.0 binaries. For a full
  rollback, stop writers and restore the matching pre-upgrade database,
  attachments and configuration to an isolated recovery target before a
  deliberate cutover; retain the failed state for investigation.

## Deliberately stricter maintenance tools

Development/test/demo commands now require explicit non-production targets and
operation-specific opt-ins. E2E runs must identify a matching test database
explicitly; seed/reset commands reject production execution and unclassified
database names. Existing scripts that relied on a generic database name or
inherited production `DATABASE_URL` need updating rather than weakening the
guard. In particular, a demo-reset job running with `NODE_ENV=production` is
not a supported exception. These are intentional maintenance-tool compatibility
changes, not a new requirement for ordinary Team HTTP requests.

Development Compose no longer seeds automatically and starts with demo mode
disabled. The Azure template can select a separate classified demo database
and run its explicitly enabled maintenance job in a non-production runtime;
the API remains in production mode. Existing databases are not renamed.

See the exact configuration and migration steps in the
[maintenance section of the upgrade guide](https://github.com/patrickschiller/openclockwork/blob/v2.0.0/UPGRADING.md#development-test-and-demo-maintenance).
The guards provide defense in depth; they do not make a privileged database
credential or destructive Docker command safe to share with a development shell.

## Validation and known limits

Validation covers automated domain/API/UI regressions plus separate Docker
upgrade/restore and representative browser workflows, including grouped break
deduction, cross-tab timers, revisions, policy history, leave expiry, timezone
boundaries and customer report output. Print-to-PDF output was also checked.
This is not a claim that every device/browser, operational recovery procedure
or long-running production scenario has received a universal manual sign-off.

- CAUR agent-usage accounting, automated model/token/runtime collection,
  invoice creation, prices, tax calculations and combined human/agent billing
  remain outside this release.
- Solo is one owner in one installation, not multi-tenant SaaS or a customer
  self-service portal. Team remains the mode for multiple active employees.
- One deployment working timezone governs day and policy boundaries; there
  are no independent per-employee working timezones. Changing display language
  does not change the working calendar or timezone.
- Maintained holiday presets cover German states. Other calendars can use
  explicit custom dates, supplied for each applicable year. There is no claim
  of automatic worldwide employment-law or accounting compliance.
- Optional targets, breaks and hints are configurable behavior, not legal
  advice. Current-day core hints are intentionally deferred, and the overview
  account cards show the current year through today rather than an arbitrary
  historical/future account-date selector.
- CSV/PDF output is a time statement, not an invoice. Browser printing/download
  behavior and access to local attachments still depend on the deployed
  environment. No automatic off-site backup or zero-data-loss guarantee is
  enabled by choosing Solo mode.

## Docker images

- `ghcr.io/patrickschiller/openclockwork-api:2.0.0`
- `ghcr.io/patrickschiller/openclockwork-web:2.0.0`

Pin a release version or verified image digest; do not use `latest` or a mutable
development image tag for unattended production upgrades.

# OpenClockwork v1.4.0

## Highlights

- Makes work policies country-neutral: employees can use no holiday calendar,
  an optional German state preset, or explicit custom holiday dates. New employee
  forms and bootstrap accounts start with an explicit zero-day leave allowance.
- Adds configurable automatic break deductions to work schedules. New schedules
  start without deduction rules; time entries capture the active rules so later
  schedule edits do not change their historical break deductions.
- Preserves existing installations through a forward migration of employee
  calendars, schedule policies, and time-entry break snapshots.
- Detects the browser's English or German language, falls back to English, and
  respects supported regional date formats. Fixes date-only leave displays and
  upcoming-leave filtering across timezone and year boundaries.
- Establishes UTC as the default deployment and new-terminal timezone, with an
  explicit timezone setting for Docker and Azure installations.
- Adds a prominent [roadmap](https://github.com/patrickschiller/openclockwork/blob/v1.4.0/ROADMAP.md)
  for complete Solo mode, customer invoicing, CAUR usage accounting, and combined
  human/agent billing. These capabilities are planned, not implemented in 1.4.0.

## Upgrade notes

- Back up PostgreSQL and request attachments before upgrading. Keep existing
  data and attachment volume names; do not use `docker compose down -v`.
- **Set `TZ` explicitly to the installation's existing working timezone before
  upgrading.** Use `Europe/Berlin` if that was the previous implicit default.
  Azure deployments must likewise set the `timeZone` parameter used by the API
  and scheduled job. Existing terminal timezones remain unchanged.
- Set `OPENCLOCKWORK_VERSION=1.4.0` and follow the
  [upgrade guide](https://github.com/patrickschiller/openclockwork/blob/v1.4.0/UPGRADING.md),
  including the notes for any skipped releases.
- Review calendars, contractual leave allowances, and schedule break rules after
  upgrading. Existing allowances and German calendar behaviour are retained;
  neutral defaults apply when creating new records.
- Update external clients to use `holidayCalendar`, `holidayDates`, and
  `breakRules` from the regenerated OpenAPI contract. The deprecated `bundesland`
  alias remains supported for German state selections, but responses can now
  contain `null`. Conflicting legacy and canonical calendar selections are rejected.
- When API and web are deployed separately, deploy the `1.4.0` API first and
  wait for `/api/health` to report version `1.4.0`; then deploy the web image.
  Docker Compose performs this ordering automatically. Close and reopen existing
  PWA/browser tabs if they continue displaying a cached application version.

## Database migrations

- `20260907120000_international_work_policies` adds employee holiday calendars
  and custom dates, schedule break rules, and time-entry break-rule snapshots.
- Existing state selections become their equivalent `DE-XX` preset. Legacy
  invalid state values retain the previous resolver's `DE-NW` fallback.
- Existing schedules and entries retain the previous 360-minute/30-minute and
  540-minute/45-minute deduction thresholds. Employees who relied on an implicit
  schedule receive an explicit preserving schedule when no default schedule exists.
- The migration allows nullable legacy `bundesland` values and changes only the
  default for newly created terminals to UTC. It retains existing rows and runs
  atomically during normal API startup; no manual SQL is required.

## Compatibility and changed defaults

- New employees default to `holidayCalendar: "NONE"` and `holidayDates: []`;
  new schedules default to `breakRules: []`. Clients and setup procedures that
  relied on automatic German holidays, break deductions, or a 30-day allowance
  must now configure their intended policies explicitly.
- API clients must tolerate nullable `bundesland` responses. Persisted time-model
  enum identifiers remain compatible; their UI labels are translated.
- UTC replaces the implicit Europe/Berlin deployment fallback. Explicitly retaining
  the existing working timezone is required to preserve day and schedule boundaries.

## Docker images

- `ghcr.io/patrickschiller/openclockwork-api:1.4.0`
- `ghcr.io/patrickschiller/openclockwork-web:1.4.0`

## Known limitations

- The API still uses one installation working timezone for day and schedule
  boundaries. Per-workspace and per-employee working timezones remain planned.
- Maintained holiday presets currently cover German states. Other calendars can
  use explicit custom dates, supplied separately for each relevant year.
- The UI currently supports English and German. Country-neutral configuration
  does not imply automatic compliance with a jurisdiction's work or billing rules.
- Solo mode, invoice creation, and CAUR-based agent billing remain roadmap items.
