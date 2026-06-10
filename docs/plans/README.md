# Implementierungspläne – Übersicht

Quelle aller fachlichen Anforderungen ist [`base-instructions.md`](../../base-instructions.md). Die Pläne hier brechen das Projekt in Epics mit konkreten Arbeitspaketen (AP) auf, sodass Backend, Frontend und Domänen-Logik parallel umgesetzt werden können. Tech-Stack-Bindung und Architektur-Regeln stehen verbindlich in [`CLAUDE.md`](../../CLAUDE.md).

## Stack (verbindlich, gilt in allen Epics)

| Schicht | Technologie |
|---|---|
| Workspace | Nx-Monorepo (pnpm) |
| Frontend | React 18+ (Vite, Tailwind CSS, shadcn/ui), PWA |
| Backend | NestJS (Node.js 20+, TypeScript strict) |
| Datenbank | PostgreSQL via Prisma ORM |
| Realtime | Socket.IO (NestJS-WebSocket-Gateway) |
| Tests | Jest (api), Vitest (web, libs/shared), Playwright (web-e2e) |
| CI | GitHub Actions (Lint, Typecheck, Test, Build, DCO-Check) |

## Pläne

1. [Epic 1 – Workspace, Datenbank & CI/CD](./epic-1-infrastructure.md)
   Lokal lauffähiger Nx-Stack, NestJS-Skelett, React/Tailwind/shadcn-Skelett, Prisma + Postgres via Docker, GitHub-Actions-Pipeline, cloud-agnostisches Deployment-Konzept.
2. [Epic 2 – Backend (NestJS, API-First)](./epic-2-backend.md)
   PrismaService, Domain-Module (Employees, TimeEntries, Accounts, Requests, Violations, ERP-Export), Auth (JWT), Realtime-Gateway, Tests.
3. [Epic 3 – Frontend (React + Vite + Tailwind + shadcn/ui)](./epic-3-frontend.md)
   PWA-Schliff, Login, Pages für Buchung, Anträge, Kalender, Dashboard, Admin-Inbox, Realtime-Anbindung, Tests.
4. [Epic 4 – Urlaub & vollständiger Freigabe-Workflow](./epic-4-vacation-workflow.md)
   Mehr-Stufen-Workflow (Substitute → Manager → optional HR → Approved), `EmployeeLeaveAllowance`, Resttage-Berechnung, Audit-Log, zugehörige Pages und Endpoints. Datenmodell ist im Schema bereits angelegt.
5. [Epic 5 – Projektzeiterfassung](./epic-5-projekte.md)
   Projekte mit Service-Aufträgen, Mitarbeiter×Projekte-Zuweisungsmatrix als Buchungsberechtigung, Projektwahl beim Stempeln, nachträgliche Zuordnung + Aufteilen von Einträgen, ERP-Export mit Projektbezug.

## Querschnittliche Regeln (gelten in allen Epics)

- **Async-Pflicht:** Jede Funktion mit I/O (Prisma, HTTP, Sockets, Filesystem) ist `async`. Blockierende Calls in Request-Handlern sind Bugs.
- **API-First:** Datenformate werden im NestJS-Backend definiert und per OpenAPI (Swagger) publiziert. Frontend-Typen werden aus dem OpenAPI-Schema generiert; bis dahin ist [`apps/web/src/api/client.ts`](../../apps/web/src/api/client.ts) der maßgebliche Vertrag (von Hand gepflegt).
- **Pure Domain Code:** Fachregeln (Pausenabzug, Resttage, Workflow-Übergänge, Kernzeit) leben als reine TS-Funktionen in `libs/shared` und sind ohne Postgres testbar.
- **Tailwind + shadcn/ui** für die gesamte Frontend-Oberfläche. Kein MUI, kein Material Web Components.
- **Secrets nur via Env/Secret-Manager:** `.env.example` als Vorlage; in der Produktion über cloud-agnostisches Secret-Management (Doppler / Hashi Vault / cloud-eigener Secret-Manager — die Plattform wählt).

## Reihenfolge der Bearbeitung

1. **Epic 1 abschließen** (PWA-Manifest, Health-Endpoint, erste Prisma-Migration) — alles andere baut darauf.
2. **Epic 2 in Schichten:** PrismaService → Pausenrechner → Konten → generische Anträge → Kernzeit + ERP-Export → Auth → Realtime.
3. **Epic 4 parallel zu Epic 2** ab dem Zeitpunkt, an dem das Requests-Modul existiert — Schema und Frontend-Client sind für Epic 4 schon vorbereitet.
4. **Epic 3** baut die echten Pages auf, sobald die zugehörigen Endpoints antworten. Skelett (App-Shell, Routing, Dashboard) steht bereits.

## Definition of Done je Epic

Ein Epic gilt als abgeschlossen, wenn alle User Stories des Epics erfüllt sind, die Akzeptanzkriterien getestet wurden (Jest für API, Vitest für Web/Shared, Playwright für E2E) und der Code im `main`-Branch lebt.
