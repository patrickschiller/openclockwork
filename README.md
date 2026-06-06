# OpenClockwork

> Open-source digital time-and-attendance management — **Zeiterfassung** done right, on a modern web stack.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![DCO](https://img.shields.io/badge/DCO-required-blue)](CONTRIBUTING.md#developer-certificate-of-origin-dco)
[![Status: alpha](https://img.shields.io/badge/status-alpha-orange)](#project-status)

OpenClockwork is a self-hostable working-time tracker for small and mid-sized organisations. It models real-world German labour-law requirements (statutory break deduction, *Soll/Ist* hour accounts, vacation balances, multi-stage approval workflows for *Urlaub*, *Home-Office*, *Sonderurlaub*, *Zeitanträge*) — but it is built to be useful anywhere that needs a credible alternative to commercial *Zeiterfassung* products.

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

**Alpha — under active development.** The project is being built from a [German requirements specification](base-instructions.md) and an [implementation guide for Claude Code](CLAUDE.md). APIs, schemas, and UI flows will change without notice until a `0.1.0` tag is published. Do not run this in production yet.

## Why another time tracker?

Most off-the-shelf systems are either cheap-and-cheerful punch clocks that ignore German labour law, or enterprise *Zeitwirtschaft* suites priced for HR departments with budget. OpenClockwork sits in the middle:

- **Lawful by construction.** Statutory break deduction, core-hour violation flags, and the 07:00 / 23:00 approval threshold are encoded in the domain layer, not bolted on by the customer.
- **Self-hostable.** PostgreSQL + a Node backend + a static web client. No SaaS lock-in; your data stays on your infrastructure.
- **PWA-first mobile experience.** Employees clock in and out from their phones with optional GPS — no app-store gatekeeper, no native build pipeline.
- **API-first.** The web client is just one consumer of the public REST + WebSocket API. ERP integration is a first-class endpoint, not an afterthought.
- **Open source under Apache 2.0.** Fork it, embed it, sell support around it. See [LICENSE](LICENSE) and [NOTICE](NOTICE) for the terms.

See the [complete feature overview](FEATURES.md) for employee, manager, HR, integration, and deployment capabilities.

## Tech stack

| Layer        | Technology                              |
| ------------ | --------------------------------------- |
| Workspace    | Nx monorepo (pnpm)                      |
| Frontend     | React 18, Vite, Tailwind CSS, shadcn/ui |
| Backend      | NestJS (Node.js, TypeScript strict)     |
| Database     | PostgreSQL with Prisma ORM              |
| Realtime     | Socket.IO (NestJS WebSocket gateway)    |
| Tests        | Vitest (web), Jest (api), Playwright    |
| CI           | GitHub Actions                          |

The full set of binding decisions and domain rules lives in [CLAUDE.md](CLAUDE.md) and [base-instructions.md](base-instructions.md).

## Repository layout

```
apps/
  api/            NestJS service: REST, WebSocket gateway, Prisma client
  web/            React + Vite + Tailwind + shadcn PWA
libs/
  shared/         Shared TS types and pure-TS domain functions
prisma/           Prisma schema and migrations (single source of DB truth)
docs/
  plans/          Per-epic implementation plans (binding for current work)
base-instructions.md   Authoritative German requirements specification
CLAUDE.md         Implementation guide consumed by Claude Code
```

## Getting started (development)

Prerequisites: **Node 20+**, **pnpm 9+**, **Docker** (for the local PostgreSQL).

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

## Contributing

Contributions are very welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and the [Developer Certificate of Origin](https://developercertificate.org/) requirement (every commit must be `Signed-off-by:` your real name).

For bugs and feature ideas, open a GitHub issue. For security vulnerabilities, follow the private process in [SECURITY.md](SECURITY.md).

By participating, you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

OpenClockwork is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for required attribution when redistributing or building derivative works.

The name "OpenClockwork" and any associated marks are trademarks of the project authors. The Apache License grants no right to use them beyond honest origin attribution.

## Acknowledgements

OpenClockwork is created and maintained by [Patrick Schiller](https://github.com/patrickschiller) and the open-source contributors listed in the project's commit history. The German requirements specification that drives the design comes from earlier in-house work and is now released under the same Apache 2.0 license alongside the code.
