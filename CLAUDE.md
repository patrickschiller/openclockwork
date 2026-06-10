# CLAUDE.md

This file is consumed by Claude Code (claude.ai/code) when working in this repository. Treat it as binding project policy. If you must deviate, flag the deviation explicitly in your response so the maintainer can approve or reject it.

## Project identity

- **Name:** OpenClockwork.
- **Repositories:** a two-repo split (see `docs/maintainer-setup.md`). **Public** `github.com/patrickschiller/openclockwork` is the canonical home for app code, issues, PRs, and releases (fresh history, no internal docs, no workflows). **Private** `github.com/patrickschiller/openclockwork-internal` holds this file, `base-instructions.md`, `docs/`, all GitHub Actions workflows, the demo deployment, and the full development history.
- **License:** Apache-2.0 (`LICENSE`) with a strong `NOTICE` file for trademark/attribution. Every contribution requires a Developer Certificate of Origin sign-off (`git commit -s`); see `CONTRIBUTING.md`.
- **Goal:** a self-hostable, lawful-by-construction working-time-tracking system. The project is positioned as an open-source alternative to commercial _Zeiterfassung_ software. Reputation, not revenue, is the success metric — code quality and clarity matter more than feature breadth.

## Working across the two repositories

- This `CLAUDE.md` exists only in the internal repo — if you are reading it from disk, you are in a checkout of `openclockwork-internal` (verify with `git remote -v`; the `public` remote points at the OSS repo).
- App code (`apps/`, `libs/`, `prisma/`, `infra/`) is developed and merged in the **public** repo. Per `docs/maintainer-setup.md`, app-code changes are not made directly in the internal repo — flag it explicitly if a task seems to require that.
- Internal docs (`docs/`, `base-instructions.md`) and all CI/CD workflows are maintained only here.
- `.github/workflows/sync-public.yml` merges public `main` into the internal repo hourly via automated sync PRs (branch `sync/public-main`). Sync merge commits are DCO-signed like everything else.
- **Pushing to internal `main` deploys to production:** `deploy-azure.yml` triggers on every push to `main` (build → push images → run migrations → roll Container Apps), followed by a Lighthouse audit (`lighthouse.yml`).

## Source of truth

`base-instructions.md` is the authoritative requirements document (German). It defines the domain — time models, statutory break deduction, approval workflows, calendar visualisation, ERP integration, mobile capture. Re-read the relevant section before generating code; never invent domain rules.

`base-instructions.md` will continue to evolve. When it is updated, the new content takes precedence over older code: prefer reconciling code with the spec over preserving an out-of-date implementation.

Implementation plans broken down by epic live in [`docs/plans/`](docs/plans/README.md). All five epic plans (Workspace + CI, NestJS Backend, React/Tailwind Frontend, Vacation/Workflow, Projektzeiterfassung) are written against the current NestJS/Prisma/Tailwind/shadcn stack and are binding. Status checkboxes reflect the actual code state in this repo, not historical .NET work.

## Tech stack (binding decisions)

These were chosen deliberately. Do not introduce alternatives without flagging the deviation.

| Layer     | Technology                                                                                                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace | **Nx monorepo** with **pnpm** as the package manager. Nx Cloud is **disabled**.                                                                                                                |
| Backend   | **NestJS** on Node.js 20+, TypeScript strict mode. Controllers stay thin; business logic lives in services and pure domain modules.                                                            |
| Database  | **PostgreSQL** accessed via **Prisma ORM**. The Prisma schema in `prisma/schema.prisma` is the single source of truth for DB structure. Migrations are committed and never edited after merge. |
| Realtime  | **Socket.IO** via a NestJS WebSocket gateway. Used for live booking updates, approval-workflow notifications, and core-time-violation flags.                                                   |
| Frontend  | **React 19** with **Vite**, **TanStack Query** for server state, styled with **Tailwind CSS** and **shadcn/ui** components (Radix-based). The app is a **PWA** (`vite-plugin-pwa`).            |
| Mobile    | The same React PWA. Architecture must keep a future React Native migration plausible — avoid browser-only APIs in shared business logic; isolate them in adapters.                             |
| Tests     | **Jest** for the NestJS app, **Vitest** for the web client and shared libs, **Playwright** for end-to-end. New endpoints and business rules without tests will not be merged.                  |
| CI/CD     | **GitHub Actions** (internal repo only): `ci.yml` (lint + type-check + test + build, affected-only on PRs, plus an `api-e2e` job against a Postgres 16 service), `dco.yml`, `deploy-azure.yml`, `lighthouse.yml`, `sync-public.yml`. Deployment is pluggable: Docker Compose (`docker-compose.prod.yml`) or the Azure Container Apps reference in `infra/azure/` (Bicep). |

## Repository layout

```
apps/
  api/            NestJS service (entry: src/main.ts; modules under src/app/:
                  auth, employees, time-entries, projects, requests, absences,
                  accounts, leave-allowances, work-schedules, violations, erp-export,
                  attachments, notifications, events (Socket.IO gateway), health, prisma)
  api-e2e/        Jest-based API integration tests (need a running Postgres)
  web/            React + Vite + Tailwind + shadcn PWA
                  src/api/        — hand-typed client.ts + OpenAPI-generated generated.ts
                  src/components/ — shadcn/ui primitives + composite components
                  src/routes/     — page-level components mounted by react-router
                  src/app/        — AppShell, navigation, providers
  web-e2e/        Playwright tests for the web client
libs/
  shared/         Pure-TS domain functions (work-time, workflow, vacation) + shared types
prisma/
  schema.prisma   Single source of truth for the DB; migrations + seed.ts alongside it
infra/azure/      Bicep reference deployment (Container Apps, ACR, Key Vault, Postgres)
ops/              nginx config template for the web container
docs/             Architecture deep-dive, ADRs, epic plans, backlog,
                  implementation-status.md, maintainer-setup.md — internal repo only
base-instructions.md   Authoritative German requirements spec — internal repo only
```

## Common commands

All scripts run from the repo root. Nx caches outputs locally (Nx Cloud is disabled).

```bash
# One-time setup
pnpm install                     # Apple Silicon: pnpm rebuild bcrypt if the native binding fails
pnpm db:up                       # docker compose up -d db — local PostgreSQL on :5432
cp .env.example .env             # then edit secrets
pnpm db:migrate                  # prisma migrate deploy — apply committed migrations
pnpm db:seed                     # idempotent seed; logins in docs/implementation-status.md
                                 # (password for every seed user: "openclockwork")

# After changing prisma/schema.prisma
pnpm prisma migrate dev          # create + apply a NEW migration (commit it)
pnpm prisma generate             # regenerate the typed client
pnpm db:reset                    # drop + remigrate + reseed (destructive)

# After changing the API surface (controllers, DTOs)
pnpm generate:api    # regenerates apps/api/openapi.json + apps/web/src/api/generated.ts
pnpm verify:api      # fails on contract drift (not yet enforced in CI)

# Day-to-day
pnpm nx run-many -t serve -p api,web   # api on :3000, web on :4200 (proxies to api)
pnpm nx serve api                       # backend only; Swagger UI at /api/docs
pnpm nx dev web                         # web only (Vite dev target)

# Quality gates (mirrors CI in .github/workflows/ci.yml)
pnpm lint            # nx run-many -t lint
pnpm typecheck       # nx run-many -t typecheck
pnpm test            # nx run-many -t test
pnpm build           # nx run-many -t build
pnpm format          # prettier write via nx format:write

# Run a single project's tests
pnpm nx test api              # Jest for the NestJS app
pnpm nx test web              # Vitest for the React client
pnpm nx test shared           # Vitest for libs/shared

# Run a single test file or pattern
pnpm nx test api -- --testPathPatterns=time-entry     # Jest pattern (plural flag — Jest 30)
pnpm nx test web -- src/routes/DashboardPage.spec.tsx # Vitest by path
pnpm nx test web -- -t "renders the dashboard"        # Vitest by test name

# E2E
pnpm nx e2e web-e2e           # Playwright
pnpm nx test api-e2e          # API integration (Jest)

# Affected-only (faster on PR branches)
pnpm nx affected -t lint typecheck test build
```

## Architecture rules

- **API-first.** The frontend never reaches into backend internals; it only consumes the public REST + Socket.IO surface defined in the OpenAPI spec generated from NestJS.
- **The OpenAPI contract is generated, not hand-maintained.** `apps/api/src/generate-openapi.ts` emits `apps/api/openapi.json`; `openapi-typescript` derives `apps/web/src/api/generated.ts` from it. Run `pnpm generate:api` after changing controllers or DTOs and commit both artifacts. (`apps/web/src/api/client.ts` is still hand-typed against the surface — known gap.)
- **Realtime is authenticated.** The Socket.IO gateway verifies the JWT on the handshake and rejects tokenless connections; don't add unauthenticated event paths.
- **Async by default.** All I/O — database, HTTP, sockets, file I/O — must be `async`/`await`. Blocking calls inside request handlers are bugs.
- **Domain code is pure.** The rules in `base-instructions.md` (break deduction, vacation calculation, approval routing, core-time detection) live as pure TypeScript functions in `libs/shared` or in NestJS providers without external dependencies. They must be unit-testable without spinning up Postgres.
- **No secrets in code.** Database URLs, ERP API keys, and SMTP credentials come from environment variables; for production, from a secret manager (cloud-agnostic — the deployment chooses).
- **OSS hygiene.** Every new third-party dependency must be license-compatible with Apache-2.0 (no GPL/AGPL surprises) and pull its weight. Justify the addition in the PR description.

## Domain rules that must be encoded

These are easy to get wrong by guessing — pull from the spec:

- **Time models:** Teilzeit, Vollzeit, Vertrauensarbeitszeit, Gleitzeit. Each employee has exactly one; it drives Soll-Stunden calculation.
- **Statutory break deduction:** 30 min after 6 h worked; an additional 15 min (45 min total) after 9 h. APIs return both Brutto- and Nettoarbeitszeit.
- **Accounts:** maintain Überstundenkonto (Ist − Soll) and Urlaubskonto with carry-over; expose current balances via async endpoints.
- **Approval threshold:** any booking or _Zeitantrag_ before 07:00 or after 23:00 triggers the _genehmigungspflichtig_ workflow. The frontend warns visually before submission.
- **Application types:** Urlaub, Home-Office, Sonderurlaub, Zeitantrag — all routed through a shared workflow engine (Substitute → Manager → optional HR → Approved, with cancel and return-for-revision transitions and an append-only audit log).
- **Kernzeitverletzungen:** detected server-side and surfaced as flags on the dashboard.
- **ERP export:** a separate, key-authenticated endpoint that exposes booked + approved times. Distinct surface from the internal app API.
- **Mobile capture:** PWA _Kommen_/_Gehen_ buttons attach GPS coordinates when the user grants permission; absence of GPS must not block the booking.
- **Calendar visualisation:** annual calendar with colour-coded states for Krankheit, Urlaub, Home-Office, Schulung, Sonderurlaub, Gleittage.
- **NRW public holidays** by default (Anonymous Gregorian Easter algorithm for moving feasts); the holiday calendar must be configurable per deployment.
- **Server timezone is `Europe/Berlin`** (set in deployment and CI). Core-time detection and the 07:00/23:00 off-hours rule reason in wall-clock local time; don't refactor them to UTC-naive comparisons.

## Implementation status

All five epic plans are functionally complete (Epics 1–4 reconciled 2026-05-19; Epic 5 Projektzeiterfassung landed 2026-06-10) and the app runs as a live Azure Container Apps deployment. `docs/implementation-status.md` is the running record of what landed and what is genuinely open — read it before assuming a feature is missing or rebuilding one that exists. Open follow-ups at the time of writing: the `verify:api` CI gate, NRW holiday markers in `CalendarPage`, auth hardening for the legacy `clock-in`/`clock-out` endpoints, and a real email/Teams delivery adapter behind `RequestNotificationService` (currently logs + socket broadcast only).

Don't introduce frameworks, ORMs, UI kits, or services the spec doesn't call for without flagging the choice. The stack is opinionated by design.

## Working-style notes for Claude Code

- Prefer editing existing files over creating new ones.
- No new top-level `.md` files unless the user asks for them. Use `docs/` for architecture notes, ADRs, and deployment guides.
- Sign every commit with DCO (`git commit -s`). The CI will reject unsigned commits in pull requests.
- Conventional Commits (`feat:`, `fix:`, `chore:`, ...) are used in this repository's commit messages.
- After changing `prisma/schema.prisma`, always run `pnpm prisma generate` so the typed client stays in sync; create migrations with `pnpm prisma migrate dev` and commit them.
- After changing the API surface (controllers, DTOs), run `pnpm generate:api` and commit the regenerated `apps/api/openapi.json` and `apps/web/src/api/generated.ts`.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
