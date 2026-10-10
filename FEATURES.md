# OpenClockwork Features

OpenClockwork 2.0.0 provides **Solo** personal work tracking and **Team** time and
attendance in one responsive, self-hosted application. Both keep deployment,
data, and configuration under the operator's control, with German and English UI.

This page describes implemented capabilities, not a guarantee that every rule,
device, or external browser handoff has been certified. See
[release notes](RELEASE_NOTES.md) for release-specific validation and
[UPGRADING.md](UPGRADING.md) for operational checks. Version 2.0 marks the
deliberate two-mode product generation; it does not imply that existing Team
installations need a reset or an automatic conversion.

Start with [Operating modes](docs/OPERATING_MODES.md), the
[Solo guide](docs/SOLO_MODE.md), or the [Team guide](docs/TEAM_MODE.md).
Invoices, rates, payments, and CAUR coding-agent usage import/accounting are
**not included**; they remain on the [roadmap](ROADMAP.md).

<p align="center">
  <img src="assets/screenshots/tablet/kiosk.png" alt="Paired OpenClockwork tablet kiosk with a rotating QR code" width="100%">
</p>

<p align="center">
  <img src="assets/screenshots/mobile/booking.png" alt="Mobile booking view" width="30%">
  <img src="assets/screenshots/mobile/terminal.png" alt="Mobile terminal scanner" width="30%">
  <img src="assets/screenshots/mobile/navigation.png" alt="Role-aware mobile navigation and overflow menu" width="30%">
</p>

## At a glance

| Audience          | Main capabilities                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Solo owner        | Personal timer, direct corrections, calendar, customers, billable projects/orders, timesheets, optional effective-dated accounts    |
| Employees         | Clock in/out, scan tablet QR codes, book daily targets, manage requests and absences, view calendars and time accounts              |
| Managers          | Review team requests, handle substitute workflows, approve or return corrections, use bulk actions, inspect project data            |
| HR administrators | Manage employees, schedules, leave, projects, reports, terminal kiosks, geofences, devices, and production bootstrap                |
| Kiosk devices     | Pair once, display a branded rotating challenge, refresh automatically, report health, and operate with least-privilege credentials |
| Integrations      | Consume documented REST endpoints, generated types, realtime events, ERP exports, and health checks                                 |

Employee, manager, HR, kiosk, and ERP capabilities in the table refer to Team.
Solo exposes only the owner's authorised personal endpoints; old Team routes
are blocked by the server, not just removed from the menu.

## Solo owner workflow

| Capability                | What it provides                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Owner bootstrap and setup | One explicit owner, generated initial password, working-timezone confirmation, no mandatory HR policy                          |
| Personal navigation       | Overview, Times, Calendar, Customers, Projects, Reports, and Settings                                                          |
| Time capture              | One running timer, manual completed intervals, atomic running-project switch, optional activity and separate private notes     |
| Corrections and splits    | Direct owner edits, reasoned correction/cancellation, capture-group break preservation, revision conflicts, and audit history  |
| Calendar                  | Completed net time plus free days, vacation, sickness, and training; first/last half-day flags and cancellation history        |
| Customers                 | Name, optional code/internal note, archive/reactivation, and deletion protection for referenced records                        |
| Projects and orders       | Customer or internal projects, automatic owner assignment, service orders, planned-hour budgets, and net actual totals         |
| Billability               | Project default, inheritable order override, and per-booking billable/non-billable value; no monetary calculation              |
| Reports                   | Date/customer/project/order/billable/unassigned filters; gross, break, net, and billable-net totals; CSV and browser print/PDF |
| Optional policies         | Weekly target, leave account, holiday dates, break rules, personal frame/core hints, daily target blocks, and GPS              |
| Policy history            | Effective dates, scheduled versions, annual leave carry-over/expiry/adjustments, and recorded mode-accounting boundaries       |
| Identity and recovery     | Self-service profile/password changes and a local operator CLI limited to the existing active Solo owner                       |

Fresh Solo installations begin without target or leave accounts, automatic
breaks, regional holiday presets, time-window hints, daily blocks, or GPS.
Personal hints do not become Team approval obligations. Closed intervals cannot
overlap or end in the future; ambiguous manual/correction times require an
explicit offset during daylight-saving changes.

Reports exclude open timers and cancelled work from final totals and never
include private notes. Archive operations cannot strand a running timer on an
unbookable customer/project/order. A booked project cannot be reassigned to a
different customer; create a new project instead.

## Safe operating-mode changes

An upgrade retains Team mode. A subsequent mode preview checks blockers without
changing configuration; confirmation repeats the checks transactionally.
Entering Solo requires one remaining active administrator, no running timers,
no unresolved requests/time approvals, and no active terminals. Entering Team
requires completed timers before adding further people.

Identities, customers, projects, bookings, and history are retained. Solo work
keeps its original approval mode. Access changes immediately; when today already
contains effective work or time off, the accounting mode starts on the next
working-timezone calendar date. See [the mode guide](docs/OPERATING_MODES.md).

Solo customer management and personal billable reports are not Team screens in
2.0. Preserving records across a switch does not make every mode-specific
workflow available in both modes.

## Mobile PWA

The React application is installable as a Progressive Web App with layouts for
desktop, tablet, and narrow phone screens. The compact profile icon
opens an identity menu with name, email, role, and logout. German and English
can be switched from the login, employee shell, and kiosk.

The primary phone navigation is intentionally task-focused. Solo uses
**Overview, Times, Calendar, Reports, More**; customers, projects, and settings
remain available from More. Team uses:

1. Dashboard
2. Booking
3. Terminal
4. Requests
5. More

Calendar, substitutes, absences, approval inboxes, project areas, and HR
administration remain reachable through the role-aware **More** menu.

<p align="center">
  <img src="assets/screenshots/mobile/calendar.png" alt="Mobile annual absence calendar" width="45%">
  <img src="assets/screenshots/mobile/vacation-request.png" alt="Mobile vacation request with live leave balance" width="45%">
</p>

The PWA is online-first: mutations require server confirmation and are not
queued as offline bookings. A running server timer survives a disconnected
client. Downloads and print/PDF depend on the browser/OS handoff: verify the
actual saved file or print result in your deployment's browser, especially when
using an embedded browser surface.

The screenshots on this page show the Team and kiosk workflows.

## QR tablet terminals (Team)

OpenClockwork turns a standard tablet into a shared, branded time-clock display
without requiring RFID badges, proprietary readers, or biometrics. The mounted
device never acts as an employee and cannot call normal HR or time-entry APIs.

<p align="center">
  <img src="assets/screenshots/admin/terminals.png" alt="Terminal administration with geofence, pairing, and device state" width="100%">
</p>

| Capability             | What it provides                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Terminal configuration | Internal name, visible location, custom message, optional PNG/JPEG/WebP logo, IANA time zone, and active state                        |
| Optional GPS           | Run without any geofence, or require a fresh position inside a configured radius and maximum accuracy                                 |
| One-time pairing       | Short-lived code and kiosk URL; a new pairing revokes the previous active device                                                      |
| Kiosk PWA              | Dedicated manifest and full-screen view with time, date, location, custom branding, connection state, and automatic challenge refresh |
| Employee scanner       | Explicit clock-in or clock-out choice, camera preview, local QR decoding, and GPS only when the terminal requires it                  |
| Device operations      | Last-seen monitoring, re-pairing, immediate device revocation, terminal deactivation, and permanent deletion                          |
| Time-zone handling     | IANA selection with the browser timezone suggested, UTC fallback, and server-side validation                                          |
| Durable audit trail    | Historical bookings retain terminal/GPS evidence snapshots even when kiosk-only records are removed                                   |

The local iPad pilot includes a trusted-HTTPS Compose overlay, generated test
CA/server certificates, loopback-only raw service ports, an Nginx TLS gateway,
Guided Access guidance, a site acceptance checklist, and MDM recommendations.
See [the German iPad setup guide](docs/IPAD_TERMINAL_SETUP.de.md).

## Employee experience (Team)

| Capability                        | What it provides                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Personal dashboard                | Leave balance, overtime account, current booking, open requests, and detected core-time violations              |
| Clock in and out                  | PWA booking with optional GPS, project/service-order selection, and recent booking history                      |
| QR terminal booking               | Scan a short-lived kiosk challenge and let the server validate identity, replay state, and optional geofence    |
| Direct daily-target block         | With per-employee HR permission, book the contractual daily target as one completed and directly approved block |
| Core-time violation details       | Date, affected core window, violation type, boundary, and uncovered minutes                                     |
| Project and service-order booking | Book only to assigned active projects; active service orders become the required booking level                  |
| Activity per booking              | Store a customer-facing description of the work performed                                                       |
| Retroactive booking changes       | Change project/service-order/activity on completed and approved entries                                         |
| Entry splitting                   | Split a closed entry at a chosen time when work changes between projects                                        |
| Retroactive range booking         | Assign a past interval to a project; coverage is validated and existing entries are split as required           |
| Automatic break accounting        | Configurable schedule thresholds and deductions; no automatic deduction for new schedules by default            |
| Time accounts                     | Calculated target hours, actual hours, overtime, and opening balances                                           |
| Annual calendar                   | Year view for vacation, home office, special leave, sickness, training, and flextime                            |
| Requests                          | Vacation, home-office, special-leave, and time-adjustment workflows                                             |
| Half-day vacation                 | Independent first-day and last-day half-day selection                                                           |
| Live leave preview                | Available, approved, submitted, and calculated leave shown while creating a request                             |
| Substitute inbox                  | Accept or decline requests when named as a substitute                                                           |
| Absence records                   | Record sickness, training, and flextime days without mobile layout overflow                                     |
| Theme preference                  | Light, dark, or operating-system theme                                                                          |

## Approval workflows (Team)

OpenClockwork models approvals as explicit state transitions instead of one
approved/rejected flag.

```text
Employee submits
  -> optional substitute confirmation
  -> manager approval
  -> optional HR confirmation
  -> approved
```

- Manager and HR inboxes from desktop and mobile navigation
- Substitute acceptance and rejection
- Manager approval, rejection, and return for correction
- HR confirmation and rejection
- Bulk approval and rejection
- Request cancellation
- Complete workflow-event history
- Special approval for bookings and corrections outside configured frames
- Local-filesystem or Azure Blob attachments for supported request types
- Daily-target blocks bypass the workflow only when HR enables the employee and
  all schedule, holiday, absence, conflict, frame, and break checks pass

## HR and administration (Team)

| Capability              | What it provides                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Employee management     | Create, edit, deactivate/reactivate, reset passwords, assign managers, and control direct daily blocks |
| Roles                   | Employee, Manager, and HRAdmin access levels with role-aware navigation and endpoint guards            |
| Time models             | Full-time, part-time, trust-based working time, and flextime                                           |
| Work schedules          | Working-day masks, permitted frames, and multiple named core-time windows                              |
| Schedule assignment     | Assign individual schedules or bulk-assign by time model                                               |
| Leave allowances        | Base leave, carry-over, adjustments, expiry dates, and adjustment reasons                              |
| Holiday calendars       | Optional regional presets and custom dates used in target hours and vacation calculations              |
| Absence administration  | Record and review sickness, training, and flextime entries                                             |
| Approval operations     | Manager/HR inboxes, bulk actions, correction loops, and workflow history                               |
| Terminal administration | Configure, activate, pair, monitor, revoke, re-pair, deactivate, or permanently delete tablet kiosks   |
| Working-time reports    | HR-only start, end, break, gross, net, approval, and CSV reporting, with optional clocking locations   |

Production starts with an empty database. The interactive
`prisma/create-admin.ts` bootstrap offers Solo or Team and creates exactly one
first owner/HR administrator,
prints a random initial password once, and refuses to run after any employee has
been created.

## Project management and reporting (Team)

Projects combine employee assignments, service orders, planned hours, actual
bookings, and customer-facing activity reports in one administrative workflow.

<p align="center">
  <img src="assets/screenshots/projects.png" alt="Project overview with PLAN/IST progress and service orders" width="100%">
</p>

- Project number, title, description, lifecycle, and optional PLAN hours
- Employee-by-project assignment matrix controlling booking eligibility
- Active/inactive service orders with their own PLAN hours
- PLAN/IST progress indicators at project and service-order level
- Protection against deleting referenced projects or service orders
- Detailed evaluations filtered by period, employee, project, and order
- Customer-facing activity report and CSV export
- Project-independent HR working-time report for all closed, non-rejected entries
- Opt-in clock-in and clock-out locations in the report table and CSV export,
  combining durable terminal labels with available GPS coordinates and accuracy

Exports contain employee names and working-time data and must be handled as
personal data under the organisation's access and retention policies. Exact
clocking locations are excluded by default and require an explicit HR action;
operators must document a lawful purpose and suitable retention period before
using them.

## Configurable working-time rules (Team)

Working-time rules are visible in code and covered by focused tests. Operators
remain responsible for validating their organisation's exact policies.

- Configurable break calculation with explicit thresholds and deduction minutes
- Target/actual accounting derived from weekly hours and working-day masks
- Opening overtime balances and employee start dates
- Configurable working frames and multiple core-time windows
- Direct daily-target validation against holidays, absences, requests, existing
  entries, permitted frames, and automatic breaks
- Detailed core-time violation detection
- Special approval handling for out-of-frame entries
- Working-day and selected-holiday aware vacation calculation
- Half-day leave and carry-over expiry processing
- Multi-stage request workflows and workflow events

New employees start with no regional holiday preset and no assumed annual leave
entitlement. German state calendars remain optional presets; custom dates
support other national, regional, or company calendars. New schedules start
without automatic break deduction. Upgrade migrations preserve existing
employee calendars and break policies.

Working-day and schedule calculations use the deployment's configured `TZ`
(UTC by default). Per-employee working timezones and more built-in regional
calendars are planned; see [ROADMAP.md](ROADMAP.md). Operators must validate
local rules and calendar coverage for each period in use.

## Languages, accessibility, and responsive design

- German and English UI across login, Solo, employee, manager, HR, and kiosk routes
- Central translation catalogue for labels, validation, states, and empty views
- Browser-language detection with English fallback and regional date formatting
- Persistent language and theme preferences
- Keyboard-operable account and mobile overflow menus
- Semantic labels for navigation, forms, buttons, progress indicators, and QR
  images
- Narrow-screen layouts, including compact Solo navigation below 360 px, with
  regression coverage for 320/375 px layout constraints
- Accessible in-app confirmations for Solo calendar cancellation and unused
  record deletion, with Cancel initially focused and pending actions disabled

## Security and data handling

- JWT access/refresh authentication for interactive users
- Employee identity taken from the authenticated token for live booking APIs
- Role-based guards for employee, manager, and HR endpoints
- Dedicated API-key protection for machine-to-machine ERP exports
- Authenticated Socket.IO connections
- Password hashing and refresh-token rotation
- Session-version invalidation after password changes or owner recovery
- Owner-only Solo access and stale-revision checks on personal mutations
- Separate `TERMINAL_QR_SECRET` for kiosk pairing and QR signing material
- Hash-only device credential storage and immediate revocation
- Short-lived challenges, daily key rotation, rate limiting, expiry, and
  per-employee replay protection
- Optional server-enforced geofences with maximum-accuracy validation
- Historical position/accuracy/radius snapshots retained when a terminal is
  deleted; pairing codes, devices, credentials, and QR challenges are removed
- Pluggable attachment storage using local volumes or Azure Blob Storage
- Public demo reset controls that are explicitly disabled by default

OpenClockwork provides technical controls, but operators remain responsible for
TLS, secrets, access policy, legal basis, retention, backups, monitoring, and
incident response.

## API and integrations

The generated and committed OpenAPI specification lives at
[`apps/api/openapi.json`](apps/api/openapi.json).

- Authenticated employee clock-in/out and terminal scanning
- HR terminal/device lifecycle endpoints and least-privilege kiosk endpoints
- Employee daily-target capability and direct-block creation
- Paginated ERP time-entry exports with project, service-order, and activity
  references
- Socket.IO events for realtime client refreshes
- Health endpoint for deployment checks
- Generated TypeScript client types for the web application
- Language-neutral API values translated by the web catalogue
- Solo installation/settings, personal days/history, owner time mutations,
  customers, and personal reports, protected by the active mode and owner identity

Machine-to-machine Team exports and terminal capabilities are not enabled by a
Solo API token. CAUR ingestion is not a hidden or experimental public endpoint
in this release.

## Self-hosting and operations

- Dockerfiles for API and web applications
- Development and production Docker Compose configurations
- Trusted-HTTPS iPad overlay with runtime-configuration validation
- PostgreSQL with versioned Prisma migrations
- Explicitly guarded synthetic seed data for disposable local evaluation only;
  normal development startup does not seed automatically
- Empty production bootstrap with a one-time Solo owner/Team administrator command
- Azure Container Apps, ACR, PostgreSQL Flexible Server, Key Vault, Blob
  Storage, and Log Analytics reference infrastructure
- Dedicated terminal QR secret in Compose and Azure Key Vault
- Stable versioned images and documented backup/migration/rollback procedures
- Nx targets for lint, type-check, build, unit, integration, E2E, and browser
  tests

## Voluntary support

The complete application and tablet terminal are Apache-2.0 software. A
one-time optional support prompt may appear to HR after the first terminal
activation; dismissing it never changes functionality. `SUPPORT_URL` can point
to another trusted HTTPS page or be empty. No payment state, entitlement, or
installation identity is sent back to OpenClockwork.

## Explore the project

- [Main README and installation guide](README.md)
- [Choose an operating mode](docs/OPERATING_MODES.md)
- [Use Solo mode](docs/SOLO_MODE.md)
- [Use Team mode](docs/TEAM_MODE.md)
- [Roadmap: billing, agent usage, and internationalisation](ROADMAP.md)
- [Set up and test an iPad terminal](docs/IPAD_TERMINAL_SETUP.de.md)
- [Upgrade an existing installation](UPGRADING.md)
- [Review published releases](https://github.com/patrickschiller/openclockwork/releases)
- [Contribute with DCO sign-off](CONTRIBUTING.md)
- [Review the security policy](SECURITY.md)
- [Inspect the OpenAPI specification](apps/api/openapi.json)
