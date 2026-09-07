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
