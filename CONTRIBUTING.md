# Contributing to OpenClockwork

Thanks for taking the time to contribute. OpenClockwork is open source under the Apache License 2.0, and we welcome bug reports, design discussions, and pull requests.

## Developer Certificate of Origin (DCO)

We do not use a Contributor License Agreement. Instead, every commit must be signed off under the [Developer Certificate of Origin 1.1](https://developercertificate.org/), which certifies that you wrote the patch (or otherwise have the right to submit it under the project license).

Sign off your commits with `git commit -s`. This appends a line to the commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

Use your real name. Anonymous or pseudonymous sign-offs cannot be accepted. The CI checks for this trailer on every commit in a pull request — unsigned commits will block the merge.

If you forgot to sign off, fix the latest commit with `git commit --amend -s` or rebase and run `git rebase --signoff <base>` for older commits.

## Reporting issues

- **Bugs:** open a GitHub issue with reproduction steps, expected vs. actual behaviour, environment details (OS, Node version, browser).
- **Security vulnerabilities:** do *not* open a public issue. See [SECURITY.md](SECURITY.md).
- **Feature ideas:** open a GitHub Discussion or a "proposal" issue first. We prefer to discuss design before code.

## Working on a change

1. Fork the repo and create a feature branch from `main`.
2. Review the [README](README.md), [feature overview](FEATURES.md), and existing code before changing domain rules — OpenClockwork models a real working-time-tracking system, and the rules around break deduction, approval thresholds, etc. are not invented.
3. Keep new dependencies aligned with the existing TypeScript, Nx, NestJS, React, Prisma, and Tailwind stack unless the pull request clearly explains the reason for a change.
4. Run `pnpm install` at the repo root, then use `pnpm nx run <project>:<target>` (e.g. `pnpm nx serve api`) for local dev.
5. Add tests. New endpoints, business rules, or UI flows without tests will not be merged.
6. Sign off your commits (`git commit -s`).
7. Open a pull request against `main`.

## Pull request expectations

- One logical change per PR. If your branch fixes a bug *and* refactors something, split it.
- The PR description should explain *why*, not just *what*. Link to the issue or discussion.
- All checks (lint, type-check, tests, DCO) must be green before review.
- A reviewer will respond within a few days. Larger changes may take longer; please be patient.
- We reserve the right to decline contributions that do not align with the project goals stated in the README.

## Coding style

- TypeScript strict mode, no `any` outside of clearly justified boundaries.
- Backend: NestJS conventions; controllers thin, services hold the logic.
- Frontend: Tailwind for styling. Component-local state via React; cross-cutting state via the patterns established in `apps/web`.
- Database: schema changes go through Prisma migrations. Never edit a migration after it has been merged to `main`.
- All public APIs are documented through their OpenAPI spec (NestJS Swagger). UI uses the generated client.

## Code of Conduct

All participants in the project community are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License of contributions

By submitting a pull request, you license your contribution under the project's [Apache 2.0 License](LICENSE) and certify the [Developer Certificate of Origin](https://developercertificate.org/) via your `Signed-off-by` line. No copyright assignment is required; you keep ownership of your work.
