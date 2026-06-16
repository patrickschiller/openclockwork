<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

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

# OpenClockwork Project Guidelines

- OpenClockwork is a public Apache-2.0 project. Keep repository metadata, README, FEATURES, CONTRIBUTING, SECURITY, and NOTICE consistent with that public-facing posture.
- Preserve the Contributor rules: external contributions require DCO sign-off (`Signed-off-by:`) and the DCO GitHub Action should remain active unless the project policy is intentionally changed.
- Use `pnpm` for package-management commands and keep the pinned toolchain aligned with `package.json` (`Node 20+`, `pnpm 9+`).
- Treat the Prisma schema and migrations as the source of truth for database changes. Add new migrations for schema changes; do not edit migrations that have already been merged to `main`.
- The backend follows NestJS conventions: controllers stay thin, services own business logic, and API changes should keep the OpenAPI spec and generated web client in sync.
- The frontend is a React/Vite/Tailwind PWA with German and English UI support. User-facing text should go through the existing i18n catalogue instead of hard-coded strings.
- Time tracking, leave, approval, break deduction, and core-hour rules model real working-time behavior. Read the existing domain tests before changing these rules, and add focused tests for behavioral changes.
- Never commit secrets, real personal data, production credentials, or local Azure parameter files. Keep demo data synthetic and make privacy implications explicit in public documentation.
- Prefer small, reviewable changes that preserve the existing monorepo boundaries between `apps/api`, `apps/web`, `apps/*-e2e`, `libs/shared`, `prisma`, and `infra`.
