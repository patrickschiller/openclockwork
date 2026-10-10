# OpenClockwork

<p align="center">
  <img src="assets/brand/openclockwork-mark.svg" alt="OpenClockwork clock and location-pin mark" width="112">
</p>

<p align="center">
  <strong>Self-hosted time tracking for one-person businesses and teams. Your work, your rules, your data.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="Apache 2.0 license"></a>
  <a href="CONTRIBUTING.md#developer-certificate-of-origin-dco"><img src="https://img.shields.io/badge/DCO-required-blue" alt="DCO required"></a>
  <a href="https://github.com/patrickschiller/openclockwork/releases/latest"><img src="https://img.shields.io/github/v/release/patrickschiller/openclockwork" alt="Latest GitHub release"></a>
</p>

OpenClockwork 2.0 brings two operating modes to one open-source application.
**Solo** helps an independent professional track personal work, organise customer
projects, and produce timesheets without inventing an HR department. **Team**
supports employee attendance, work schedules, leave, approvals, and tablet
terminals. Both use the same self-hosted PostgreSQL, API, and responsive PWA.

The interface is available in German and English on phones, tablets, and
desktops. Language is independent of working-time rules: targets, breaks,
holidays, and leave are explicit configuration, not assumptions about your
country. No proprietary time-clock hardware or hosted subscription is required.

**Existing installations remain in Team mode after an upgrade.** A mode change
is a separate, authenticated administrator action with a preview and safety
checks. Invoice creation, monetary billing, and CAUR coding-agent usage import
are not included in 2.0.1; see the [roadmap](ROADMAP.md).

## Choose your mode

|                 | Solo                                                                     | Team                                                                |
| --------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Best fit        | One person tracking their own work                                       | An organisation managing multiple people                            |
| Daily workflow  | Timer, manual entries, direct corrections, personal calendar             | Employee bookings, requests, manager/HR workflows                   |
| Work rules      | Optional targets, leave account, breaks, and personal hints              | Employee contracts, schedules, leave allowances, and approvals      |
| Customer work   | Customers, projects/orders, billable classification, personal timesheets | Assigned projects/orders, PLAN/IST reports, HR working-time reports |
| Shared terminal | Not available in Solo                                                    | Paired tablet QR terminals with optional geofencing                 |
| Start here      | [Solo guide](docs/SOLO_MODE.md)                                          | [Team guide](docs/TEAM_MODE.md)                                     |

Read [Operating modes](docs/OPERATING_MODES.md) for boundaries and safe
transitions. Solo is not a separate account tier or a license restriction; it
is an installation-wide workflow and access mode. Team does not yet expose the
Solo customer-management and billable-timesheet UI.

<p align="center">
  <img src="assets/screenshots/tablet/kiosk.png" alt="OpenClockwork tablet terminal with a rotating QR code" width="100%">
</p>

<p align="center">
  <img src="assets/screenshots/mobile/booking.png" alt="Mobile clock-in and clock-out view with optional GPS and project selection" width="30%">
  <img src="assets/screenshots/mobile/terminal.png" alt="Mobile QR terminal scanner" width="30%">
  <img src="assets/screenshots/mobile/vacation-request.png" alt="Mobile vacation request with live leave balance" width="30%">
</p>

<p align="center">
  <strong>Team-mode examples: employee booking, QR scanning, and leave requests.</strong><br>
  <a href="FEATURES.md">Explore the complete feature overview</a>
</p>

## Highlights

- **A complete personal workflow.** In Solo, start with all attendance-related
  accounts disabled, capture actual work, correct or cancel it with an audit
  trail, organise customers/projects/orders, and export billable or non-billable
  timesheets. Private notes stay out of customer reports.
- **Flexible time capture.** Clock actual start/end times, add an optional GPS
  position and project, or use an HR-enabled daily-target block.
- **QR tablet terminal.** Pair an iPad or another tablet once, show a rotating
  short-lived challenge, and let employees clock in or out from their own
  authenticated phones—without badges, chips, or biometric readers.
- **Optional geofencing.** A terminal can work entirely without GPS or require a
  fresh employee position inside a server-validated radius with a configured
  accuracy limit.
- **Configurable working-time rules.** Break deduction, working frames, core
  hours, target/actual balances, public holidays, and leave calculations live in
  tested backend/shared-domain code.
- **Team approval workflows.** Vacation, home office, special leave, time
  corrections, substitute confirmation, manager approval, HR confirmation,
  bulk actions, and workflow history.
- **Projects and reporting.** Assign employees, structure projects by service
  order, compare PLAN and IST hours, edit booking targets, split entries, and
  export customer or working-time reports with optional clock-in/out locations.
- **Self-hosted and API-first.** PostgreSQL, NestJS, React, OpenAPI, Socket.IO,
  Docker, and an Azure reference deployment—without SaaS lock-in.
- **Localised interface.** German and English translations, browser-aware dates,
  and a persistent language switcher across login, Solo, employee, manager, HR,
  and kiosk experiences.

Solo corrections are owner actions, not employee approval requests. Optional
personal policies are effective-dated; changing tomorrow's rules does not
rewrite yesterday's bookings. See the [feature overview](FEATURES.md) for a
mode-by-mode breakdown.

## Use in any country

Language does not select a country's work rules. Configure the installation's
IANA working timezone, employee holiday calendars, leave allowances, working
days, and schedule break rules for your organisation. New employee records
start without a regional holiday preset or assumed annual leave entitlement;
new schedules start without automatic break deduction. Existing German state
calendars remain available as optional presets, and custom holiday dates can
represent other countries, regions, and company closures.

The API currently evaluates working days and schedule boundaries in one
deployment timezone (`TZ`, default `UTC`). Set this explicitly before recording
real data. A kiosk's display timezone does not change payroll or working-day
boundaries. Multiple simultaneous employee working timezones and additional
maintained regional calendars are covered in the [roadmap](ROADMAP.md).

## Tablet terminal (Team mode)

An HR administrator creates a terminal with an internal name, visible location,
custom message, optional logo, IANA time zone, and optional GPS geofence. After
activation, a one-time code pairs exactly one kiosk device. The kiosk then shows
a continuously refreshed QR challenge while the employee PWA performs the
authenticated booking.

<p align="center">
  <img src="assets/screenshots/admin/terminals.png" alt="HR terminal administration with pairing and device status" width="100%">
</p>

The security model is deliberately separate from an employee session:

- kiosk credentials are least-privilege, revocable, and stored only as hashes;
- QR challenges are opaque, short-lived, rate-limited, and protected against
  replay per employee;
- daily signing material is derived from a dedicated `TERMINAL_QR_SECRET`, not
  from `JWT_SECRET`;
- clock-in/out uses the authenticated employee identity from the bearer token;
- terminal location labels, geofence positions, accuracy, and radius snapshots
  remain in the historical booking audit record even if the terminal is later
  deleted permanently;
- pairing, kiosk, and mobile camera/location flows are documented for trusted
  local HTTPS and managed iPad deployments.

See [the German iPad setup and operations guide](docs/IPAD_TERMINAL_SETUP.de.md)
for certificates, pairing, Guided Access, pilot acceptance tests, MDM rollout,
device replacement, revocation, and troubleshooting.

## Project status

OpenClockwork is intended for self-hosting, with automated domain, API, and UI
tests, versioned releases, and documented upgrade procedures. See
[release notes](RELEASE_NOTES.md) for the scope and validation of each version;
do not treat automated coverage as certification of every browser, device, or
organisation-specific policy.

**Why 2.0?** This version deliberately marks a new product generation: Solo and
Team are both first-class workflows. The major number is not a claim that the
release requires a data reset or intentionally breaks existing Team APIs.
Existing installations migrate forward and retain Team mode. Future
compatibility changes follow semantic versioning and will be called out in
release notes and [UPGRADING.md](UPGRADING.md).

Operators must still validate organisation-specific working-time rules,
collective agreements, payroll integrations, privacy requirements, backups,
monitoring, and incident procedures. OpenClockwork provides technical controls;
it is not legal advice.

Exact clock-in and clock-out locations are excluded from HR working-time reports
by default. HR administrators must explicitly include them in the on-screen
report and CSV export; operators remain responsible for a lawful purpose,
appropriate access, and retention periods for this personal data.

See the [latest release](https://github.com/patrickschiller/openclockwork/releases/latest)
and read [UPGRADING.md](UPGRADING.md) before changing an existing installation.

The PWA is online-first. A running timer remains server state while a device is
offline; new writes require server confirmation and are not queued as offline
bookings. CSV export starts a browser download, and print/PDF uses the browser's
print dialog. Verify both handoffs in your chosen browser or installed PWA;
embedded browsers may handle downloads and printing differently.

## Tech stack

| Layer      | Technology                                                         |
| ---------- | ------------------------------------------------------------------ |
| Workspace  | Nx monorepo with pnpm                                              |
| Frontend   | React 19, Vite, Tailwind CSS, shadcn/ui, installable PWA           |
| Backend    | NestJS, Node.js, strict TypeScript                                 |
| Database   | PostgreSQL with Prisma schema and forward-only migrations          |
| Realtime   | Authenticated Socket.IO gateway                                    |
| API        | REST with committed OpenAPI specification and generated web client |
| Tests      | Vitest, Jest, API E2E, and Playwright browser tests                |
| Deployment | Docker Compose and Azure Container Apps reference infrastructure   |

## Repository layout

```text
apps/
  api/            NestJS REST/WebSocket service
  api-e2e/        API and domain integration tests
  web/            React/Vite/Tailwind PWA and kiosk UI
  web-e2e/        Browser smoke tests
libs/
  shared/         Shared types and pure working-time domain functions
prisma/           Schema, migrations, seed, and admin bootstrap
docs/             Operator and device setup guides
infra/azure/      Azure reference deployment
ops/              Runtime validation, TLS, Nginx, and operations scripts
assets/           Brand sources and documentation screenshots
```

## Getting started

For production, use the [versioned Docker installation](#production-installation-step-by-step)
below; Node.js and pnpm are not required on that host. Source development needs
**Node.js 20+**, **pnpm 9+**, and **Docker**.

### Development with Node.js and Docker

```bash
git clone https://github.com/patrickschiller/openclockwork.git
cd openclockwork

pnpm install
cp .env.example .env
docker compose up -d db
pnpm prisma generate
pnpm prisma migrate deploy
pnpm db:create-admin
pnpm nx run-many -t serve -p api,web
```

Open `http://localhost:4200`. Vite proxies API calls to
`http://localhost:3000`. The interface uses a supported browser language, falling
back to English. Use the language menu on the login screen or in the application
header to choose English or German; your choice is saved.

The bootstrap command is for an empty employee table and asks you to choose
Solo or Team. Keep an existing `.env` and its database identity when returning
to an existing checkout; do not rerun initial setup or copy over its secrets.

### Full local Docker stack

```bash
cp .env.dev.example .env.dev

docker compose \
  -f docker-compose.dev.yml \
  --env-file .env.dev \
  up -d --build
```

| Service    | URL                     | Host mapping                |
| ---------- | ----------------------- | --------------------------- |
| Web/PWA    | `http://localhost:8080` | `8080:8080`                 |
| API        | `http://localhost:3001` | `3001:3001`                 |
| PostgreSQL | `localhost:5432`        | configurable with `DB_PORT` |

The API applies pending migrations before starting. It does **not** automatically
load synthetic data: ordinary development startup must not overwrite a database
or silently create demo users. For a new empty database, use the same interactive
bootstrap entry point, targeting the development stack:

```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev \
  exec api node --import tsx prisma/create-admin.ts
```

Keep demos in a deliberately separate development/demo database and follow the
seed command's explicit safety requirements. Never seed a production database
or use seeding to repair an existing installation. Stop the stack with:

```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev down
```

Do not add `-v` unless you explicitly intend to delete the local database.

### Local HTTPS iPad terminal pilot

Camera and geolocation APIs require a trusted secure origin on mobile devices.
The iPad overlay adds a local TLS gateway, binds raw database/API/HTTP ports to
loopback, and exposes only the configured HTTPS port to the test LAN.

```bash
cp .env.ipad.example .env.ipad

docker compose \
  -f docker-compose.dev.yml \
  -f docker-compose.ipad.yml \
  --env-file .env.ipad \
  up -d --build
```

Replace all example addresses before starting. Local certificates, private
keys, and `.env.ipad` are ignored by Git and must never be committed. Follow
[the complete iPad guide](docs/IPAD_TERMINAL_SETUP.de.md) instead of exposing
the regular HTTP port to a tablet.

## Production installation (step by step)

Production installations use versioned API and web images from the GitHub
Container Registry. The database starts empty: production never loads the
development/demo seed. Follow every step below to configure the installation
and create its first Solo owner or Team HR administrator. Upgrading an existing
database is a different workflow: use [UPGRADING.md](UPGRADING.md), do not run
bootstrap again, and keep the existing volume names.

### 1. Prepare the host and configuration

Install Docker Engine with the Docker Compose plugin, then obtain this
repository and enter its directory:

```bash
git clone https://github.com/patrickschiller/openclockwork.git
cd openclockwork
git switch --detach v2.0.1
cp .env.prod.example .env.prod
```

Keep `.env.prod` private. It contains production credentials and is ignored by
Git. Do not commit it or copy it into an issue, log, or support request.

### 2. Generate independent secrets

Generate every secret separately. Run each of the following commands exactly
once and copy its output only to the variable named in the comment:

```bash
# POSTGRES_PASSWORD (use this same value in DATABASE_URL as well)
openssl rand -hex 24

# JWT_SECRET
openssl rand -hex 32

# TERMINAL_QR_SECRET (must be independent from JWT_SECRET)
openssl rand -hex 32

# ERP_API_KEY
openssl rand -hex 32

# CRON_API_KEY
openssl rand -hex 32
```

Open `.env.prod` in an editor and replace every `change-me` value:

- Set `OPENCLOCKWORK_VERSION=2.0.1` for this release. Use the same explicit
  version for the API and web images; never deploy `latest`.
- Put the first command's output into `POSTGRES_PASSWORD` and replace
  `change-me-database-password` inside `DATABASE_URL` with that exact same
  value. These two locations must match.
- Put the output of each subsequent command into its matching variable:
  `JWT_SECRET`, `TERMINAL_QR_SECRET`, `ERP_API_KEY`, or `CRON_API_KEY`. These
  four values must all be different from each other and from the database
  password. `TERMINAL_QR_SECRET` derives the rotating QR signatures and must
  never silently reuse the interactive session secret.
- Set `API_CORS_ORIGINS` to the exact URL used in the browser to open
  OpenClockwork. Include `http://` or `https://` and include the port when it is
  not the protocol default, but do not add a trailing slash or path:
  - Local installation on the default port:
    `API_CORS_ORIGINS=http://localhost:8080`
  - Public installation behind TLS:
    `API_CORS_ORIGINS=https://time.example.com`
  - If more than one browser origin is required, separate the complete URLs
    with commas and no spaces.
- Keep the volume names stable across future upgrades. Set `TZ` and `WEB_PORT`
  as required for the installation.

If a PostgreSQL password contains URL-special characters, percent-encode it in
`DATABASE_URL`. The hexadecimal command above avoids that ambiguity.

### 3. Pull and start the services

Choose exactly one of the following variants.

#### Variant A: install a published release

Use this on a production host when `OPENCLOCKWORK_VERSION` refers to an image
that has already been published to GHCR:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

#### Variant B: test the current local source tree

Use this for an unpublished branch or local `main` checkout. Do not run the
`pull` command from variant A: it would download the published release instead
of testing the local changes.

```bash
docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.prod.build.yml \
  --env-file .env.prod \
  up -d --build
```

This variant builds `openclockwork-api:local` and `openclockwork-web:local` from
the current working tree. Docker may still need to download the PostgreSQL,
Node.js, and nginx base images if they are not present locally.

The API waits for PostgreSQL and runs `prisma migrate deploy` before it starts.
Migrations create the empty production schema but never create demo employees,
projects, bookings, or known passwords.

### 4. Verify the empty installation

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T api ./node_modules/.bin/prisma migrate status

curl --fail http://localhost:8080/api/health
```

All services should be healthy, the migrations should be current, and the
health endpoint should return HTTP 200. Replace `8080` if `WEB_PORT` has been
changed. The login form is intentionally empty in production at this point.

### 5. Choose Solo or Team and create the first account

Run the interactive bootstrap command from the production host. Do not add
`-T`: the command requires a terminal for its prompts.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec api node --import tsx prisma/create-admin.ts
```

The first prompt asks for `Solo` or `Team` (interactive default: `Solo`).

- **Solo:** enter your first name, last name, and email. The command creates the
  single owner; no personnel number, contract hours, leave entitlement, manager,
  or work schedule is required. Personal targets, leave, hints, daily blocks,
  GPS, and automatic break deductions start disabled.
- **Team:** enter the first administrator's personnel number, name, email, time
  model, weekly hours, leave allowance, start date, and optional holiday preset.
  Enter the organisation's actual values; the displayed defaults are not legal
  or contractual recommendations.

Both choices create exactly one active `HRAdmin` identity internally and print a
strong random initial password once. In Solo, the application presents that
identity as the **owner**, not as a separate HR department. Store the password
privately. Bootstrap refuses to run if any employee already exists and never
imports the demo seed.

Unattended setup accepts explicit non-secret fields; use `--help` for the
options. For compatibility, an invocation with options but without `--mode`
defaults to **Team**. Merely appending `--mode Solo` or `--mode Team` does not
start interactive prompts: supply the required identity fields as well.

### 6. Sign in and replace the initial password

1. Open the configured public URL (or `http://localhost:8080` while testing
   directly on the host; use the configured `WEB_PORT` if it differs).
2. Sign in with the email address and generated initial password from step 5.
3. In **Settings → Password**, enter the current password and a new unique
   password of at least 12 characters. The signed-in owner/administrator can
   also review their name and email in Settings.
4. Password changes invalidate existing access and refresh sessions. Sign in
   again with the new password before discarding the initial password.

### 7. Finish setup for your mode

- **Solo:** the first login opens personal setup. Confirm the displayed working
  timezone and either leave the optional policies off or configure the ones you
  need. Complete setup, then create a customer/project or start tracking internal
  work. Follow [the Solo walkthrough](docs/SOLO_MODE.md).
- **Team:** review the administrator's employee data, then create schedules,
  employees, reporting relationships, projects, and assignments. Configure
  terminal kiosks only if wanted. Follow [the Team walkthrough](docs/TEAM_MODE.md).

Nothing from `prisma/seed.ts` belongs in a production database. Switching mode
later is explicit and guarded; it is not a substitute for completing setup.

### 8. Protect the installation

Configure TLS/reverse-proxy access, database backups, and attachment backups
before entering real personal data. The PostgreSQL database and locally stored
attachments use stable named Docker volumes.

**Warning — there is no command to execute in this part of the installation.**
The following operations destroy application data and must never be used in
production: removing Compose volumes during shutdown, resetting Prisma
migrations, running the database-reset script, or running the destructive demo
reset. A normal stop or restart must always preserve the named volumes.

If the bootstrap command reports that an employee already exists, do not reset
or seed the database to work around it. Preserve a backup and investigate the
existing data; the bootstrap command is intentionally not an administrator
recovery or privilege-escalation tool.

Maintainers can build the same production-shaped stack from the current source
tree with the local override:

```bash
docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.prod.build.yml \
  --env-file .env.prod \
  up -d --build
```

For an existing installation, follow the backup, migration, verification, and
rollback procedure in [UPGRADING.md](UPGRADING.md).

## Voluntary support

OpenClockwork—including the tablet terminal—remains fully available under
Apache 2.0. There are no licence keys, paid unlocks, usage limits, or payment
checks.

After the first terminal activation, HR may see a one-time, explicitly optional
support link (approximately EUR 125). Skipping or closing it never changes
functionality. OpenClockwork does not receive payment status or tie sponsorship
to installation data. Operators can replace or disable the link with
`SUPPORT_URL`.

You can also support the project through
[GitHub Sponsors](https://github.com/sponsors/patrickschiller).

## Documentation

- [Complete feature overview](FEATURES.md)
- [Operating modes: choose and switch safely](docs/OPERATING_MODES.md)
- [Solo: personal setup, customer work, reports, and recovery](docs/SOLO_MODE.md)
- [Team: employees, schedules, approvals, terminals, and reports](docs/TEAM_MODE.md)
- [Roadmap: billing, agent usage, and further internationalisation](ROADMAP.md)
- [iPad terminal setup and operations (German)](docs/IPAD_TERMINAL_SETUP.de.md)
- [Upgrade procedure](UPGRADING.md)
- [Release process](RELEASING.md)
- [Azure reference deployment](infra/azure/README.md)
- [Generated OpenAPI specification](apps/api/openapi.json)
- [Security policy](SECURITY.md)
- [Contribution guide](CONTRIBUTING.md)

## Contributing

Contributions are welcome. Every commit from an external contributor must carry
a valid DCO `Signed-off-by:` line; the DCO GitHub Action enforces this policy.
Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request and use the
private process in [SECURITY.md](SECURITY.md) for vulnerabilities.

## License

OpenClockwork is licensed under the [Apache License 2.0](LICENSE). See
[NOTICE](NOTICE) for attribution requirements. The name “OpenClockwork” and its
marks are trademarks of the project authors; the Apache licence does not grant
rights beyond honest origin attribution.

OpenClockwork is created and maintained by
[Patrick Schiller](https://github.com/patrickschiller) and the open-source
contributors listed in the repository history.
