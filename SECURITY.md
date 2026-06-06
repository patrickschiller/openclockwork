# Security Policy

## Reporting a vulnerability

If you believe you have found a security vulnerability in OpenClockwork, **please do not open a public GitHub issue, discussion, or pull request**. Public disclosure before a fix is available puts users at risk.

Instead, send a private report by email to:

> **p@trickschiller.de**

Use the subject prefix `[OpenClockwork Security]` so your report is not lost in spam. Encrypted email is welcome — request a PGP key in your initial message and one will be provided.

Please include:

- A description of the issue and the impact you believe it has.
- The OpenClockwork version (commit hash or release tag) you tested against.
- Step-by-step reproduction instructions or a proof-of-concept.
- Whether the vulnerability is already publicly known or has been disclosed elsewhere.
- Whether you would like to be credited for the report, and under which name.

## Response process

- **Acknowledgement:** within 3 working days of receipt.
- **Triage and assessment:** within 10 working days. We will share our analysis with you, including severity rating (CVSS v4 where applicable) and a tentative fix timeline.
- **Fix and coordinated disclosure:** the project will privately develop and review a patch. We will agree a coordinated public-disclosure date with you. For critical issues we aim for a patched release within 30 days; lower-severity issues may take longer.
- **Public advisory:** once a fix is released, a GitHub Security Advisory will be published, crediting you (unless you requested anonymity) and explaining the issue, impact, and mitigation.

## Scope

In scope:

- The OpenClockwork API (`apps/api`), web client (`apps/web`), shared libraries (`libs/*`), and the contents of this repository.
- Reference deployment configurations (Docker, Helm) checked into the repo.

Out of scope:

- Vulnerabilities in third-party dependencies, except where OpenClockwork's usage of them is itself flawed. Please report dependency issues to their respective upstream projects.
- Self-hosted instances operated by third parties — contact the operator directly.
- Social-engineering attacks against the maintainers, denial-of-service via resource exhaustion that requires no security flaw, or issues that require a fully compromised host.

## Safe-harbour

Good-faith security research conducted in line with this policy will not be pursued legally by the project authors. Do not access, modify, or destroy data that does not belong to you, do not pivot to systems outside this scope, and do not run automated scanners against systems you do not own.

Thank you for helping keep OpenClockwork and its users safe.
