# ADR-0001: Azure hosting topology for the OpenClockwork reference deployment

- **Status:** Accepted
- **Date:** 2026-05-18 (proposed) / 2026-05-18 (accepted)
- **Deciders:** Patrick Schiller (maintainer), Claude Code (paired execution)

## Context

OpenClockwork is an Apache-2.0 self-hostable Zeiterfassung. The project ships
deliberately deployment-agnostic Docker images (`Dockerfile.api`,
`Dockerfile.web`, `docker-compose.prod.yml`) so users can run it anywhere.

Separately, we need a *reference* hosted environment for:

- demoing the alpha to evaluators without asking them to run Docker;
- catching regressions against a real cloud database before tagging releases;
- giving the maintainer a low-friction staging slot to test PRs.

The maintainer's preferred cloud is Azure. This ADR captures the topology
for that reference deployment. None of the choices below imply a hard
dependency in the codebase — the docker-compose path remains the supported
self-hosting story.

## Decision

### Hosting

| Concern              | Choice                              | Why                                                                                                                              |
| -------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Compute (api + web)  | **Azure Container Apps**            | Pay-per-second, scales to zero (cheap for an alpha), built-in HTTPS, KEDA scaling on HTTP load, no orchestrator to babysit.      |
| Image registry       | **Azure Container Registry (Basic)**| Native ACA integration via managed identity, automatic image pull, geo-replication available later.                              |
| Database             | **Azure Database for PostgreSQL — Flexible Server (Burstable B1ms)** | Managed Postgres 16, point-in-time restore, private VNet endpoint, no surprise reboots like the deprecated Single Server.        |
| Secrets              | **Azure Key Vault** + ACA secret references | Secrets never live in env-files or repo. ACA references them at deploy time; the api container gets them as env vars.            |
| Logs / metrics       | **Log Analytics workspace** (auto-wired by ACA) | One place for app logs, container restarts, ingress traces. Cheap with default retention (30 days).                              |
| Attachment storage   | **Azure Blob Storage** (single container `requestattachments`) | Unblocks Punkt 8 (Datei-Upload für Sonderurlaub) with a managed-identity-authenticated `BlobServiceClient` — no shared key in env. |
| TLS / DNS            | **ACA-managed cert** on a custom `*.openclockwork.dev`-ish CNAME (TBD) | Free, auto-renewed. Custom domain wiring is a separate task once the maintainer picks one.                                       |

### Region

**West Europe (Amsterdam)** as the single deployment region.

- Lowest latency from DE without the higher pricing and slower feature
  rollout of Germany West Central.
- All chosen services (ACA, ACR, PG Flexible, Key Vault, Blob, Log Analytics)
  are GA in West Europe.
- Data-residency story for EU customers is acceptable for an alpha (data
  stays in the EU). Customers with strict in-Germany requirements can
  self-host using the same images.

### Identity & deploy pipeline

- **GitHub OIDC → Azure AD federated credential** for `azure/login@v2`. No
  long-lived service-principal secret in GitHub.
- Two ACA "revisions" per service (production + staging) using
  ACA's built-in traffic split, so we can warm a new revision and flip
  100% traffic atomically.
- Workflow trigger: `push` to `main` builds + tags + pushes both images
  to ACR, then runs `az containerapp update --image …` for api and web.
  Migrations run **before** the api revision flips traffic via a one-shot
  `containerapp job` that executes `prisma migrate deploy`.
- The web container's nginx config keeps the same `/api` and `/socket.io`
  proxy paths — in ACA they resolve to the api container app via the
  internal DNS name, no public ingress on the api.

### Cost envelope (rough; alpha)

| Item                                     | EUR / month (est.) |
| ---------------------------------------- | -----------------: |
| ACA api + web (scale-to-zero, ~10h/day)  | ~5–15              |
| Postgres Flexible B1ms (32 GB storage)   | ~25                |
| ACR Basic                                | ~4                 |
| Key Vault (low-volume ops)               | <1                 |
| Blob Storage (LRS, < 5 GB)               | <1                 |
| Log Analytics (5 GB ingest, 30d ret.)    | ~10                |
| Bandwidth                                | ~3                 |
| **Total**                                | **~50**            |

Numbers are approximate, exclude any free Azure credits. Production-grade
HA (multi-AZ Postgres, multi-revision ACA) would roughly double this.

## Alternatives considered

- **App Service for Containers**: solid, but no scale-to-zero, no traffic
  splitting between revisions out of the box, no built-in pull-from-ACR
  with managed identity for jobs. Strictly more cost for less control.
- **AKS**: massive overkill for a single-tenant alpha. Worth revisiting
  if/when multi-tenant SaaS becomes a goal.
- **Germany West Central**: rejected as default for slower feature
  rollout and higher cost. Documented as an opt-in path for customers
  who need it.
- **Bundling `@nestjs/schedule`** for the carry-over expiry cron:
  rejected (see commit `a2252ce`). Instead, an ACA scheduled job will
  POST to `/api/admin/leave-allowances/expire-carryovers` daily.
- **Local attachment storage (volume mount on ACA)**: rejected. ACA
  doesn't guarantee persistent volumes across revisions; Blob is the
  right primitive for "user-uploaded artifacts that outlive a revision".

## Consequences

### Positive

- Reproducible from a single Bicep / `az` script (delivery in a follow-up).
- OIDC-only deploys: no GitHub secret rotation work.
- Scale-to-zero keeps the alpha cheap.
- Punkt 8 (Datei-Upload) can be unblocked behind a `StorageAdapter`
  interface with a `BlobStorageAdapter` for prod and a
  `LocalFsStorageAdapter` for `docker-compose.prod.yml`.

### Negative

- ACA cold starts (a few seconds) on the first request after idle. Mitigated
  by min-replicas=1 if it ever bothers users; the alpha tolerates it.
- Bicep / `az`-script lock-in for the *reference* deployment. The Docker
  images themselves are portable, so this is a soft lock-in only.
- Log Analytics retention is metered — keep ingest disciplined.

### Follow-up tasks unlocked by this ADR

1. `infra/azure/` — Bicep templates for ResourceGroup, ACR, Postgres, KV,
   Log Analytics, ACA env + two ACA apps.
2. GitHub OIDC federation on the repo + Azure side (one-time `az` setup).
3. `.github/workflows/deploy-azure.yml` — build + push + roll on main.
4. `StorageAdapter` interface + `BlobStorageAdapter` to land Punkt 8.
5. ACA scheduled job: nightly cron → `POST /api/admin/leave-allowances/expire-carryovers`.
6. Optional later: Lighthouse-CI as a follow-up GH Action against the
   deployed URL.

## Revoke path

If we change our mind, the only artefacts to remove are:

- the `infra/azure/` Bicep folder (to be added),
- the deploy workflow,
- the Azure-specific `StorageAdapter` implementation.

Nothing in the application code becomes coupled to Azure — the existing
docker-compose path stays the canonical, supported way to self-host.
