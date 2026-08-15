# OpenClockwork

> Open-source digital time-and-attendance management — **Zeiterfassung** done right, on a modern web stack.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![DCO](https://img.shields.io/badge/DCO-required-blue)](CONTRIBUTING.md#developer-certificate-of-origin-dco)
[![GitHub Release](https://img.shields.io/github/v/release/patrickschiller/openclockwork)](https://github.com/patrickschiller/openclockwork/releases/latest)

OpenClockwork is a self-hostable working-time tracker for small and mid-sized organisations. It models real-world German labour-law requirements (statutory break deduction, _Soll/Ist_ hour accounts, vacation balances, multi-stage approval workflows for _Urlaub_, _Home-Office_, _Sonderurlaub_, _Zeitanträge_) — but it is built to be useful anywhere that needs a credible alternative to commercial _Zeiterfassung_ products.

The project is intentionally small in scope and opinionated in its choices, so a single developer or a small team can stand it up, run it, and trust the numbers.

<p align="center">
  <img src="assets/screenshots/mobile/booking.jpg" alt="OpenClockwork mobile clock-in and clock-out view with optional GPS" width="30%">
  <img src="assets/screenshots/mobile/calendar.jpg" alt="OpenClockwork mobile annual absence calendar" width="30%">
  <img src="assets/screenshots/mobile/vacation-request.jpg" alt="OpenClockwork mobile vacation request with live leave balance" width="30%">
</p>

<p align="center">
  <strong>Mobile-first PWA for employees, managers, and HR.</strong><br>
  <a href="FEATURES.md">Explore the complete feature overview</a>
</p>

## Project status

**Stable and ready for self-hosting.** The core employee, manager, HR,
approval, reporting, and self-hosting workflows are covered by automated tests.
Stable releases follow semantic versioning and include release notes and upgrade
instructions. Operators must still validate organisation-specific working-time
rules, integrations, security requirements, backups, and operating procedures.

See the [latest GitHub Release](https://github.com/patrickschiller/openclockwork/releases/latest)
and read [UPGRADING.md](UPGRADING.md) before changing an existing installation.

## Why another time tracker?

Most off-the-shelf systems are either cheap-and-cheerful punch clocks that ignore German labour law, or enterprise _Zeitwirtschaft_ suites priced for HR departments with budget. OpenClockwork sits in the middle:

- **Lawful by construction.** Statutory break deduction, detailed core-hour violation reporting, and the 07:00 / 23:00 approval threshold are encoded in the domain layer, not bolted on by the customer.
- **Self-hostable.** PostgreSQL + a Node backend + a static web client. No SaaS lock-in; your data stays on your infrastructure.
- **PWA-first mobile experience.** Employees clock in and out from their phones with optional GPS, while role-aware mobile navigation keeps manager and HR approval workflows accessible — no app-store gatekeeper, no native build pipeline.
- **Multilingual by design.** The user interface is available in German and English, with a persistent language switcher and a central translation catalogue that makes additional languages straightforward to maintain.
- **API-first.** The web client is just one consumer of the public REST + WebSocket API. ERP integration is a first-class endpoint, not an afterthought.
- **Open source under Apache 2.0.** Fork it, embed it, sell support around it. See [LICENSE](LICENSE) and [NOTICE](NOTICE) for the terms.

See the [complete feature overview](FEATURES.md) for employee, manager, HR, integration, and deployment capabilities.

## Tech stack

| Layer     | Technology                                                            |
| --------- | --------------------------------------------------------------------- |
| Workspace | Nx monorepo (pnpm)                                                    |
| Frontend  | React 19, Vite, Tailwind CSS, shadcn/ui, central DE/EN i18n catalogue |
| Backend   | NestJS (Node.js, TypeScript strict)                                   |
| Database  | PostgreSQL with Prisma ORM                                            |
| Realtime  | Socket.IO (NestJS WebSocket gateway)                                  |
| Tests     | Vitest (web), Jest (api), Playwright                                  |
| Quality   | Nx lint, type-check, and test targets                                 |

## Repository layout

```
apps/
  api/            NestJS service: REST, WebSocket gateway, Prisma client
  web/            React + Vite + Tailwind + shadcn PWA
libs/
  shared/         Shared TS types and pure-TS domain functions
prisma/           Prisma schema and migrations (single source of DB truth)
infra/            Reference deployment infrastructure
```

## Getting started (development)

Prerequisites: **Node 20+**, **pnpm 9+**, **Docker** (for the local PostgreSQL).

### Option A: Node.js + Docker (classic dev workflow)

```bash
# Clone
git clone https://github.com/patrickschiller/openclockwork.git
cd openclockwork

# Install dependencies
pnpm install

# Boot a local Postgres
docker compose up -d db

# Apply migrations and seed
pnpm prisma migrate dev

# Run the backend (port 3000) and the web client (port 4200) in parallel
pnpm nx run-many -t serve -p api,web
```

The Vite web client is then available at http://localhost:4200 and proxies API calls to http://localhost:3000.

The interface starts in German by default. Use the language menu on the login
screen or in the application header to switch between German and English. The
selection is stored locally in the browser.

### Option B: Full local Docker stack (containerized everything)

For a fully containerised environment — including the web frontend and API — use the provided dev compose file:

```bash
# Prepare environment variables
cp .env.dev.example .env.dev

# Build & start all services (DB → API → Web)
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d --build
```

The API container applies pending migrations and seeds the development database
automatically before starting.

| Service  | URL                     | Port mapping        |
| -------- | ----------------------- | ------------------- |
| Frontend | `http://localhost:8080` | `8080:8080` (Nginx) |
| API      | `http://localhost:3001` | `3001:3001`         |
| Database | `localhost:5432`        | internal (`5432`)   |

> **Tip:** If a local PostgreSQL already binds to port `5432`, set `DB_PORT=5433` in `.env.dev` before starting the stack.
> If port `8080` is already in use, set `WEB_PORT` to another host port in `.env.dev`.

Stop the stack with `docker compose -f docker-compose.dev.yml down`. The `-v`
option also deletes persistent volumes and is only appropriate when you
explicitly want to discard the local development database.

## Production deployment

Production deployments use versioned API and web images from the GitHub
Container Registry. Pin every installation to a concrete version instead of
using `latest`:

```bash
cp .env.prod.example .env.prod
# Replace all change-me values and set the public API_CORS_ORIGINS URL.

docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

The PostgreSQL database and locally stored request attachments use stable,
named Docker volumes. On startup, the API runs `prisma migrate deploy`, which
applies pending migrations without resetting the database. Never use
`docker compose down -v`, `prisma migrate reset`, or `pnpm db:reset` for a
production installation.

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

## Releases

OpenClockwork uses [GitHub Releases](https://github.com/patrickschiller/openclockwork/releases)
and [Semantic Versioning](https://semver.org/). Each release contains user-facing
highlights, upgrade and database notes, breaking changes, known issues, and the
matching Docker image tags. Release tags use the `vMAJOR.MINOR.PATCH` form;
Docker images omit the leading `v`. Maintainers follow [RELEASING.md](RELEASING.md)
to prepare and publish a release.

## Public demo deployment

The Azure reference deployment can run as an ephemeral public demo in West
Europe. Set `environment = 'demo'` and `enableDemoReset = true` in the Bicep
parameters. A scheduled Container Apps job then deletes all application rows
and uploaded attachment blobs every night before recreating the seed data.
The checked-in example keeps the reset disabled. Copy
`infra/azure/main.example.bicepparam` to the gitignored
`infra/azure/main.bicepparam`, replace every `CHANGE-ME-*` placeholder locally,
and never commit that file.

The reset is intentionally destructive and guarded by two explicit environment
variables. Never enable it for staging or production. A public demo must also
carry a visible notice that visitors must not enter real personal data:

- Database backups can retain deleted rows for the configured Azure PostgreSQL
  backup-retention period.
- Logs and browser caches may outlive the nightly reset.
- Use synthetic demo accounts only; do not connect production integrations.

The reset schedule uses UTC. The example configuration runs at `03:00 UTC`.

## Contributing

Contributions are very welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and the [Developer Certificate of Origin](https://developercertificate.org/) requirement (every commit must be `Signed-off-by:` your real name).

For bugs and feature ideas, open a GitHub issue. For security vulnerabilities, follow the private process in [SECURITY.md](SECURITY.md).

By participating, you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

OpenClockwork is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for required attribution when redistributing or building derivative works.

The name "OpenClockwork" and any associated marks are trademarks of the project authors. The Apache License grants no right to use them beyond honest origin attribution.

## Acknowledgements

OpenClockwork is created and maintained by [Patrick Schiller](https://github.com/patrickschiller) and the open-source contributors listed in the project's commit history.
