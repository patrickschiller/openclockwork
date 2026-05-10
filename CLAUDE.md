# CLAUDE.md

This file is consumed by Claude Code (claude.ai/code) when working in this repository. Treat it as binding project policy. If you must deviate, flag the deviation explicitly in your response so the maintainer can approve or reject it.

## Project identity

- **Name:** OpenClockwork.
- **Repository:** `github.com/patrickschiller/openclockwork` (currently private; will become public once the alpha is usable).
- **License:** Apache-2.0 (`LICENSE`) with a strong `NOTICE` file for trademark/attribution. Every contribution requires a Developer Certificate of Origin sign-off (`git commit -s`); see `CONTRIBUTING.md`.
- **Goal:** a self-hostable, lawful-by-construction working-time-tracking system. The project is positioned as an open-source alternative to commercial *Zeiterfassung* software. Reputation, not revenue, is the success metric — code quality and clarity matter more than feature breadth.

## Source of truth

`base-instructions.md` is the authoritative requirements document (German). It defines the domain — time models, statutory break deduction, approval workflows, calendar visualisation, ERP integration, mobile capture. Re-read the relevant section before generating code; never invent domain rules.

`base-instructions.md` will continue to evolve. When it is updated, the new content takes precedence over older code: prefer reconciling code with the spec over preserving an out-of-date implementation.

## Tech stack (binding decisions)

These were chosen deliberately. Do not introduce alternatives without flagging the deviation.

| Layer       | Technology                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| Workspace   | **Nx monorepo** with **pnpm** as the package manager. Nx Cloud is **disabled**.                                             |
| Backend     | **NestJS** on Node.js 20+, TypeScript strict mode. Controllers stay thin; business logic lives in services and pure domain modules. |
| Database    | **PostgreSQL** accessed via **Prisma ORM**. The Prisma schema in `prisma/schema.prisma` is the single source of truth for DB structure. Migrations are committed and never edited after merge. |
| Realtime    | **Socket.IO** via a NestJS WebSocket gateway. Used for live booking updates, approval-workflow notifications, and core-time-violation flags. |
| Frontend    | **React 18** with **Vite**, styled with **Tailwind CSS** and **shadcn/ui** components (Radix-based). The app is a **PWA** (service worker + manifest). |
| Mobile      | The same React PWA. Architecture must keep a future React Native migration plausible — avoid browser-only APIs in shared business logic; isolate them in adapters. |
| Tests       | **Jest** for the NestJS app, **Vitest** for the web client and shared libs, **Playwright** for end-to-end. New endpoints and business rules without tests will not be merged. |
| CI/CD       | **GitHub Actions** for lint + type-check + test + build, plus a DCO sign-off check on every PR. Deployment targets are pluggable; no hard dependency on a specific cloud. |

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
- **Approval threshold:** any booking or *Zeitantrag* before 07:00 or after 23:00 triggers the *genehmigungspflichtig* workflow. The frontend warns visually before submission.
- **Application types:** Urlaub, Home-Office, Sonderurlaub, Zeitantrag — all routed through a shared workflow engine (Substitute → Manager → optional HR → Approved, with cancel and return-for-revision transitions and an append-only audit log).
- **Kernzeitverletzungen:** detected server-side and surfaced as flags on the dashboard.
- **ERP export:** a separate, key-authenticated endpoint that exposes booked + approved times. Distinct surface from the internal app API.
- **Mobile capture:** PWA *Kommen*/*Gehen* buttons attach GPS coordinates when the user grants permission; absence of GPS must not block the booking.
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
- The local working directory is currently still named `bag-chronos/` for historical reasons — that does not affect the project name. Renaming the folder is a manual follow-up the user will do when convenient.
