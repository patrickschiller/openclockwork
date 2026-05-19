# CLAUDE.md

This file is consumed by Claude Code (claude.ai/code) when working in this repository. Treat it as binding project policy. If you must deviate, flag the deviation explicitly in your response so the maintainer can approve or reject it.

## Project identity

- **Name:** OpenClockwork.
- **Repository:** `github.com/patrickschiller/openclockwork` (currently private; will become public once the alpha is usable).
- **License:** Apache-2.0 (`LICENSE`) with a strong `NOTICE` file for trademark/attribution. Every contribution requires a Developer Certificate of Origin sign-off (`git commit -s`); see `CONTRIBUTING.md`.
- **Goal:** a self-hostable, lawful-by-construction working-time-tracking system. The project is positioned as an open-source alternative to commercial _Zeiterfassung_ software. Reputation, not revenue, is the success metric — code quality and clarity matter more than feature breadth.

## Source of truth

`base-instructions.md` is the authoritative requirements document (German). It defines the domain — time models, statutory break deduction, approval workflows, calendar visualisation, ERP integration, mobile capture. Re-read the relevant section before generating code; never invent domain rules.

`base-instructions.md` will continue to evolve. When it is updated, the new content takes precedence over older code: prefer reconciling code with the spec over preserving an out-of-date implementation.

Implementation plans broken down by epic live in [`docs/plans/`](docs/plans/README.md). All four epic plans (Workspace + CI, NestJS Backend, React/Tailwind Frontend, Vacation/Workflow) are written against the current NestJS/Prisma/Tailwind/shadcn stack and are binding. Status checkboxes reflect the actual code state in this repo, not historical .NET work.

## Tech stack (binding decisions)

These were chosen deliberately. Do not introduce alternatives without flagging the deviation.

| Layer     | Technology                                                                                                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace | **Nx monorepo** with **pnpm** as the package manager. Nx Cloud is **disabled**.                                                                                                                |
| Backend   | **NestJS** on Node.js 20+, TypeScript strict mode. Controllers stay thin; business logic lives in services and pure domain modules.                                                            |
| Database  | **PostgreSQL** accessed via **Prisma ORM**. The Prisma schema in `prisma/schema.prisma` is the single source of truth for DB structure. Migrations are committed and never edited after merge. |
| Realtime  | **Socket.IO** via a NestJS WebSocket gateway. Used for live booking updates, approval-workflow notifications, and core-time-violation flags.                                                   |
| Frontend  | **React 18** with **Vite**, styled with **Tailwind CSS** and **shadcn/ui** components (Radix-based). The app is a **PWA** (service worker + manifest).                                         |
| Mobile    | The same React PWA. Architecture must keep a future React Native migration plausible — avoid browser-only APIs in shared business logic; isolate them in adapters.                             |
| Tests     | **Jest** for the NestJS app, **Vitest** for the web client and shared libs, **Playwright** for end-to-end. New endpoints and business rules without tests will not be merged.                  |
| CI/CD     | **GitHub Actions** for lint + type-check + test + build, plus a DCO sign-off check on every PR. Deployment targets are pluggable; no hard dependency on a specific cloud.                      |

## Repository layout

```
apps/
  api/            NestJS service (entry: src/main.ts, modules under src/app/)
  api-e2e/        Jest-based API integration tests
  web/            React + Vite + Tailwind + shadcn PWA
                  src/api/        — generated/typed API client + react-query hooks
                  src/components/ — shadcn/ui primitives + composite components
                  src/routes/     — page-level components mounted by react-router
                  src/app/        — AppShell, navigation, providers
  web-e2e/        Playwright tests for the web client
libs/
  shared/         Pure-TS shared types and domain functions (importable by api + web)
prisma/
  schema.prisma   Single source of truth for the DB; migrations live alongside it
docs/             Architecture notes, ADRs, epic plans, backlog, pitch deck
base-instructions.md   Authoritative German requirements specification
```

The local working directory is still named `bag-chronos/` for historical reasons — that is unrelated to the project name and does not affect anything.

## Common commands

All scripts run from the repo root. Nx caches outputs locally (Nx Cloud is disabled).

```bash
# One-time setup
pnpm install
docker compose up -d db          # start local PostgreSQL on :5432
cp .env.example .env             # then edit secrets
pnpm prisma generate             # regenerate client after schema changes
pnpm prisma migrate dev          # create + apply a new migration

# Day-to-day
pnpm nx run-many -t serve -p api,web   # api on :3000, web on :4200 (proxies to api)
pnpm nx serve api                       # backend only
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
pnpm nx test api -- --testPathPattern=time-entry      # Jest pattern
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

## Implementation order

The project is being built from the ground up after a stack pivot from .NET/Azure. Follow this sequence so each layer rests on a working one:

1. **Workspace + identity** (this commit): Nx scaffold, identity files, CI skeleton.
2. **Database + domain core**: Prisma schema, pure-function domain modules, unit tests.
3. **API surface**: NestJS modules for employees, time entries, requests, accounts, ERP export.
4. **Realtime**: Socket.IO gateway with auth, broadcasting workflow transitions and violation flags.
5. **Web client**: React + Tailwind + shadcn UI on top of the OpenAPI client. Dashboard, booking, requests, calendar, admin, substitute inbox.
6. **PWA + mobile capture**: service worker, manifest, GPS-aware Kommen/Gehen.
7. **Deployment**: Docker images, compose file, CI build pipeline.

Don't introduce frameworks, ORMs, UI kits, or services the spec doesn't call for without flagging the choice. The stack is opinionated by design.

## Working-style notes for Claude Code

- Prefer editing existing files over creating new ones.
- No new top-level `.md` files unless the user asks for them. Use `docs/` for architecture notes, ADRs, and deployment guides.
- Sign every commit with DCO (`git commit -s`). The CI will reject unsigned commits in pull requests.
- Conventional Commits (`feat:`, `fix:`, `chore:`, ...) are used in this repository's commit messages.
- After changing `prisma/schema.prisma`, always run `pnpm prisma generate` so the typed client stays in sync; create migrations with `pnpm prisma migrate dev` and commit them.

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
