# OpenClockwork

> Open-source digital time-and-attendance management — **Zeiterfassung** done right, on a modern web stack.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![DCO](https://img.shields.io/badge/DCO-required-blue)](CONTRIBUTING.md#developer-certificate-of-origin-dco)
[![Status: alpha](https://img.shields.io/badge/status-alpha-orange)](#project-status)

OpenClockwork is a self-hostable working-time tracker for small and mid-sized organisations. It models real-world German labour-law requirements (statutory break deduction, _Soll/Ist_ hour accounts, vacation balances, multi-stage approval workflows for _Urlaub_, _Home-Office_, _Sonderurlaub_, _Zeitanträge_) — but it is built to be useful anywhere that needs a credible alternative to commercial _Zeiterfassung_ products.

The project is intentionally small in scope and opinionated in its choices, so a single developer or a small team can stand it up, run it, and trust the numbers.

## Project status

**Alpha — under active development.** APIs, schemas, and UI flows will change without notice until a `0.1.0` tag is published. Do not run this in production yet.

## Why another time tracker?

Most off-the-shelf systems are either cheap-and-cheerful punch clocks that ignore German labour law, or enterprise _Zeitwirtschaft_ suites priced for HR departments with budget. OpenClockwork sits in the middle:

- **Lawful by construction.** Statutory break deduction, core-hour violation flags, and the 07:00 / 23:00 approval threshold are encoded in the domain layer, not bolted on by the customer.
- **Self-hostable.** PostgreSQL + a Node backend + a static web client. No SaaS lock-in; your data stays on your infrastructure.
- **PWA-first mobile experience.** Employees clock in and out from their phones with optional GPS — no app-store gatekeeper, no native build pipeline.
- **API-first.** The web client is just one consumer of the public REST + WebSocket API. ERP integration is a first-class endpoint, not an afterthought.
- **Open source under Apache 2.0.** Fork it, embed it, sell support around it. See [LICENSE](LICENSE) and [NOTICE](NOTICE) for the terms.

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

OpenClockwork is created and maintained by [Patrick Schiller](https://github.com/patrickschiller) and the open-source contributors listed in the project's commit history.
