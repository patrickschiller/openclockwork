# Epic 1 – Workspace, Datenbank & CI/CD

> Quelle: [`base-instructions.md`](../../base-instructions.md), Epic 1 (US 1.1, 1.2, 1.3) und [`CLAUDE.md`](../../CLAUDE.md) § Implementation order.
> Ziel: Lokal lauffähiger Nx-Monorepo-Stack mit NestJS-API, React-Web-Client, PostgreSQL über Prisma und automatischer Build-/Lint-/Test-Pipeline.

## Stack (verbindlich)

| Schicht | Technologie |
|---|---|
| Workspace | Nx-Monorepo, pnpm, Nx Cloud aus |
| Frontend | React 18+ (Vite, Tailwind CSS, shadcn/ui), perspektivisch PWA |
| Backend | NestJS auf Node.js 20+, TypeScript strict |
| Datenbank | PostgreSQL via Prisma ORM (Schema in `prisma/schema.prisma`) |
| Realtime | Socket.IO (NestJS-WebSocket-Gateway, Details in Epic 2) |
| Tests | Jest (`apps/api`), Vitest (`apps/web`, `libs/shared`), Playwright (`apps/web-e2e`) |
| CI | GitHub Actions (Lint, Typecheck, Test, Build, DCO-Check) |
| Deployment | bewusst cloud-agnostisch — Docker-Image-basiertes Container-Deployment, Cloud-Anbieter wird nicht festgelegt |

## Definition of Done

- `pnpm install && pnpm nx run-many -t lint typecheck test build` läuft lokal und in CI grün durch.
- `apps/api` startet via `pnpm nx serve api` auf `:3000` und liefert `/api/health` (200 OK).
- `apps/web` startet via `pnpm nx dev web` auf `:4200`, lädt die App-Shell und proxyt API-Calls auf `:3000`.
- `docker compose up -d db` bringt einen lokalen PostgreSQL hoch; `pnpm prisma migrate dev` legt das Schema an.
- Push gegen `main` triggert CI (Lint + Typecheck + Test + Build) und DCO-Check; rote PRs werden blockiert.
- PWA-Manifest und Service Worker sind ausgeliefert und in Chrome DevTools / Lighthouse als installierbar verifizierbar (siehe AP 1.3).

## Arbeitspakete

### AP 1.1 – Repository & Workspace-Bootstrap

- [x] Nx-Monorepo (`nx.json`, `tsconfig.base.json`, `pnpm-workspace.yaml`) mit pnpm als Package-Manager und deaktiviertem Nx Cloud (`"analytics": false`).
- [x] Top-Level-Struktur: `apps/`, `libs/`, `prisma/`, `docs/`, `.github/`.
- [x] `.gitignore` für Node, Nx, macOS/Windows; `.editorconfig` für einheitliche Whitespaces.
- [x] Prettier (`.prettierrc`, `.prettierignore`) und Flat-ESLint-Config (`eslint.config.mjs`).
- [x] OSS-Identitätsdateien: `LICENSE` (Apache-2.0), `NOTICE`, `CONTRIBUTING.md` (mit DCO-Hinweis), `CODE_OF_CONDUCT.md`, `SECURITY.md`, `README.md`, `CLAUDE.md`.

### AP 1.2 – Backend-Skelett (`apps/api`)

- [x] NestJS-App via `@nx/nest` (`apps/api/src/main.ts`, `app.module.ts`, `app.controller.ts`, `app.service.ts`).
- [x] Build/Serve über `webpack-cli` + `@nx/js:node` Targets in `apps/api/package.json`.
- [x] Abhängigkeiten gepinnt: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/platform-socket.io`, `@nestjs/websockets`, `@nestjs/config`, `@nestjs/swagger`, `@prisma/client`.
- [ ] **Health-Endpoint** `/api/health` (async) liefert `{ status, service, utcTimestamp }` — `HealthResponse`-Typ existiert bereits in `apps/web/src/api/client.ts`. Aktuell antwortet nur der Default-Controller mit `getData()`.
- [ ] **`@nestjs/config`** verdrahten (`ConfigModule.forRoot({ isGlobal: true })`), Werte aus `.env` (`API_PORT`, `API_CORS_ORIGINS`, `DATABASE_URL`, `ERP_API_KEY`, `JWT_SECRET`).
- [ ] **CORS** aus `API_CORS_ORIGINS` (kommasepariert) im `main.ts` aktivieren.
- [ ] **Swagger/OpenAPI** unter `/api/docs` exponieren (`@nestjs/swagger` ist bereits installiert).
- [ ] **PrismaService** als Singleton in einem `PrismaModule` bereitstellen (`onModuleInit → $connect`, `enableShutdownHooks`).

### AP 1.3 – Frontend-Skelett (`apps/web`)

- [x] React-18-App via `@nx/react` (`apps/web/src/main.tsx`, `app/app.tsx`, Vite als Bundler).
- [x] Tailwind-Setup: `tailwind.config.js`, `postcss.config.js`, `src/styles.css` mit Tailwind-Layern.
- [x] shadcn/ui-Setup: `components.json`, `src/lib/utils.ts` (`cn`), Primitive in `src/components/ui/` — aktuell: `alert`, `badge`, `button`, `card`, `dialog`, `dropdown-menu`, `input`, `label`, `separator`, `sheet`, `tooltip`.
- [x] App-Shell `src/app/AppShell.tsx`: Sidebar (ab `md`), Topbar mit Employee-Picker, Bottom-Nav (mobil); Role-basiertes Filtern via `visibleNavItems(role)` aus `src/app/navigation.ts`.
- [x] Routing-Skelett mit `react-router-dom` v6: `/`, `/booking`, `/calendar`, `/requests`, `/substitute`, `/admin/requests` (alle bis auf `/` aktuell als `PlaceholderPage`).
- [x] `CurrentEmployee`-Provider (Übergang bis JWT da ist) lädt Mitarbeiter aus `/api/employees`, persistiert die Auswahl in `localStorage`, stellt sie als `useCurrentEmployee()`-Hook bereit.
- [x] Typisierter API-Client `src/api/client.ts` mit Fetch-Wrapper und allen aktuell relevanten Endpoints (Vacation-Workflow inklusive).
- [ ] **PWA-Manifest** `manifest.webmanifest` (Name, Theme-Color, Icons 192/512/maskable, `display=standalone`) und `<link rel="manifest">` in `index.html`. `index.html` aktuell mit Default-Title "Web" und ohne Manifest.
- [ ] **Service Worker** via `vite-plugin-pwa` (Workbox-Strategie `autoUpdate`) — Plugin noch nicht in `vite.config.mts`.
- [ ] **PWA-Icons** (PNGs 192, 512, maskable) in `apps/web/public/`. Aktuell liegt dort nur `favicon.ico`.
- [ ] **Installations-Prompt-Hook** (`beforeinstallprompt`).

### AP 1.4 – Datenbank & Prisma

- [x] `docker-compose.yml` mit `postgres:16-alpine`, persistentem Volume und Healthcheck — `docker compose up -d db` startet die DB auf `:5432`.
- [x] `prisma/schema.prisma` als Single Source of Truth (siehe Epic 2 für Modell-Details und Epic 4 für die Workflow-Erweiterungen, die hier bereits modelliert sind).
- [x] `.env.example` mit `DATABASE_URL`, `API_PORT`, `API_CORS_ORIGINS`, `ERP_API_KEY`, `JWT_SECRET`.
- [ ] **Erste Prisma-Migration** via `pnpm prisma migrate dev --name epic1_initial` erzeugen und committen — `prisma/migrations/` existiert noch nicht.
- [ ] **Seeder** (`prisma/seed.ts` + `prisma.seed`-Eintrag in `package.json`): 1 HR-Admin, 2 Manager, 5–20 Mitarbeiter, jahresweise `EmployeeLeaveAllowance`. Idempotent.

### AP 1.5 – CI/CD (GitHub Actions)

- [x] `.github/workflows/ci.yml`: PostgreSQL-Service-Container, `pnpm install --frozen-lockfile`, `prisma generate`, `nx run-many` für `lint`, `typecheck`, `test`, `build`. Concurrency-Cancel für gleiche Refs.
- [x] `.github/workflows/dco.yml`: DCO-Sign-off-Check auf jedem Pull Request.
- [x] Issue- und PR-Templates unter `.github/ISSUE_TEMPLATE/` und `.github/pull_request_template.md`.
- [ ] **Build-Cache** für Nx im CI-Job (`actions/cache` auf `.nx/cache`) — beschleunigt Re-Runs deutlich, aktuell nicht aktiv.
- [ ] **Affected-Pipeline** (`pnpm nx affected -t ...`) für PR-Builds, sobald die Pipeline länger als ~3 Min braucht.

### AP 1.6 – Verifikation

- [x] `pnpm install` läuft sauber durch; `pnpm-lock.yaml` ist committed.
- [x] `pnpm nx run-many -t lint typecheck build` läuft grün auf `main`.
- [x] CI auf `main` und PRs durchgängig grün.
- [ ] `/api/health` lokal abrufbar (verschoben bis AP 1.2 fertig).
- [ ] Lighthouse-Run auf `apps/web` mit Manifest + Service Worker als installierbar verifiziert (verschoben bis AP 1.3 fertig).

### AP 1.7 – Deployment-Targets (cloud-agnostisch)

- [ ] Multi-Stage `Dockerfile` für `apps/api` (Build mit Prisma-Generate, Slim-Runtime mit Node 20).
- [ ] Statisches Build-Artefakt für `apps/web` (`pnpm nx build web`) — auslieferbar über jeden Static Host (Caddy, nginx, S3+CDN, Cloudflare Pages).
- [ ] `docker-compose.prod.yml` als Referenz-Setup (api + db + reverse-proxy).
- [ ] Secret-Management: Doku in `docs/` zu Optionen (Doppler / Hashi Vault / cloud-eigene Secret-Manager). Keine Empfehlung erzwingen, nur die Erwartung an die Schnittstelle (`process.env.X`).

## Risiken & Hinweise

- **Nx-Plugin-Drift:** `@nx/nest` und `@nx/react` ändern Generator-Defaults zwischen Major-Versionen. Vor Upgrade die `nx migrate`-Schritte prüfen.
- **Prisma-Migrationen:** Migrationen sind committed und werden nach Merge nie editiert — siehe `CLAUDE.md`. Bei Konflikten neue Migration erstellen statt alte zu verändern.
- **PWA-Caching-Falle:** Workbox `autoUpdate` aktualisiert beim nächsten Reload; klar kommunizieren, dass API-Calls ohne Netz hart fehlschlagen (kein Offline-Queue für Buchungen — siehe Epic 3).
- **Auth verschoben:** AP 1.2 lässt Auth bewusst aus; bis Epic 2/AP 2.6 lebt die Anwendung mit `actorId`/`employeeId` aus dem Request-Body und der `CurrentEmployee`-Übergangslösung im Frontend.
- **Cloud bewusst offen:** Anders als der Vorgänger-Plan (.NET/Azure) bindet sich der neue Stack an keinen Cloud-Anbieter. Die einzige harte Erwartung an die Plattform ist Postgres + Container-Runtime.
