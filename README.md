# OpenClockwork

> Open-source digital time-and-attendance management — **Zeiterfassung** done right, on a modern web stack.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![DCO](https://img.shields.io/badge/DCO-required-blue)](CONTRIBUTING.md#developer-certificate-of-origin-dco)
[![Status: beta](https://img.shields.io/badge/status-beta-blue)](#project-status)

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

**Beta — feature-complete and tested for the current scope.** The core employee, manager, HR, approval, reporting, and self-hosting workflows are implemented and covered by automated tests. Before a production rollout, validate organisation-specific working-time rules, integrations, security requirements, and operating procedures.

## Why another time tracker?

Most off-the-shelf systems are either cheap-and-cheerful punch clocks that ignore German labour law, or enterprise _Zeitwirtschaft_ suites priced for HR departments with budget. OpenClockwork sits in the middle:

- **Lawful by construction.** Statutory break deduction, core-hour violation flags, and the 07:00 / 23:00 approval threshold are encoded in the domain layer, not bolted on by the customer.
- **Self-hostable.** PostgreSQL + a Node backend + a static web client. No SaaS lock-in; your data stays on your infrastructure.
- **PWA-first mobile experience.** Employees clock in and out from their phones with optional GPS — no app-store gatekeeper, no native build pipeline.
- **API-first.** The web client is just one consumer of the public REST + WebSocket API. ERP integration is a first-class endpoint, not an afterthought.
- **Open source under Apache 2.0.** Fork it, embed it, sell support around it. See [LICENSE](LICENSE) and [NOTICE](NOTICE) for the terms.

See the [complete feature overview](FEATURES.md) for employee, manager, HR, integration, and deployment capabilities.

## Tech stack

| Layer     | Technology                              |
| --------- | --------------------------------------- |
| Workspace | Nx monorepo (pnpm)                      |
| Frontend  | React 19, Vite, Tailwind CSS, shadcn/ui |
| Backend   | NestJS (Node.js, TypeScript strict)     |
| Database  | PostgreSQL with Prisma ORM              |
| Realtime  | Socket.IO (NestJS WebSocket gateway)    |
| Tests     | Vitest (web), Jest (api), Playwright    |
| Quality   | Nx lint, type-check, and test targets   |

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

The web client is then available at http://localhost:4200 and proxies API calls to http://localhost:3000.

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
| Frontend | `http://localhost:4200` | `4200:8080` (Nginx) |
| API      | `http://localhost:3001` | `3001:3001`         |
| Database | `localhost:5432`        | internal (`5432`)   |

> **Tip:** If a local PostgreSQL already binds to port `5432`, set `DB_PORT=5433` in `.env.dev` before starting the stack.

Stop the stack with `docker compose -f docker-compose.dev.yml down`. Add `-v` to also remove persistent volumes.

## Contributing

Contributions are very welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and the [Developer Certificate of Origin](https://developercertificate.org/) requirement (every commit must be `Signed-off-by:` your real name).

For bugs and feature ideas, open a GitHub issue. For security vulnerabilities, follow the private process in [SECURITY.md](SECURITY.md).

By participating, you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

OpenClockwork is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for required attribution when redistributing or building derivative works.

The name "OpenClockwork" and any associated marks are trademarks of the project authors. The Apache License grants no right to use them beyond honest origin attribution.

## Acknowledgements

OpenClockwork is created and maintained by [Patrick Schiller](https://github.com/patrickschiller) and the open-source contributors listed in the project's commit history.
