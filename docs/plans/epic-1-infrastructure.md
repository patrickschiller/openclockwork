# Epic 1 – Infrastruktur & CI/CD

> Quelle: [`base-instructions.md`](../../base-instructions.md), Epic 1 (US 1.1, 1.2, 1.3).
> Ziel: Lauffähige Cloud-Plattform mit automatischem Deployment und initial bootstrappten Code-Projekten.

## Definition of Done

- Backend (.NET 8 Web API) läuft als Azure App Service unter HTTPS.
- Frontend (React PWA) läuft als Azure Static Web App oder zweiter App Service unter HTTPS.
- Azure SQL ist provisioniert; Connection String liegt in Key Vault, App Service liest sie via Managed Identity.
- Push auf `main` baut beide Anwendungen und deployed sie automatisch (GitHub Actions).
- PWA ist installierbar (Manifest + Service Worker auditierbar in Chrome DevTools / Lighthouse).

## Arbeitspakete

### AP 1.1 – Repository-Bootstrap (lokal, vor erstem Push)

- [x] Mono-Repo-Struktur: `backend/`, `frontend/`, `.github/workflows/`, `docs/`.
- [x] `.gitignore` für .NET + Node + macOS/Windows.
- [x] Root-`README.md` mit Kurzbeschreibung und Verweis auf `docs/plans/`.
- [x] `.editorconfig` für einheitliche Whitespaces.

### AP 1.2 – Backend-Skelett (US 1.1, Vorbereitung Epic 2)

- [x] `BagChronos.sln` mit Projekt `BagChronos.Api` (ASP.NET Core 8, Minimal APIs).
- [x] Health-Endpoint `/api/health` (async).
- [x] Swagger/OpenAPI aktiviert (Swashbuckle).
- [x] CORS für Frontend-Origin konfigurierbar via `appsettings`.
- [x] Konfiguration für SQL-Connection-String über Key Vault Reference (App-Setting `Sql__ConnectionString` zeigt auf `kv-bagchronos-623bc0`).

### AP 1.3 – Frontend-Skelett (US 1.3)

- [x] Vite + React + TypeScript Projekt im `frontend/`.
- [x] `vite-plugin-pwa` mit Manifest (Name, Icons, Theme-Color) und Service Worker (Workbox autoUpdate).
- [x] Material UI v6 (MD3) als Komponentenbibliothek (`@mui/material`, `@emotion/*`).
- [x] API-Client (axios oder fetch-Wrapper) mit Basis-URL aus `import.meta.env.VITE_API_BASE_URL`.
- [x] Smoke-Page, die `/api/health` aufruft und Status anzeigt.

### AP 1.4 – Azure-Ressourcen (US 1.1)

Schritt-für-Schritt in [`docs/azure-setup.md`](../azure-setup.md). Stand 2026-04-29 angelegt in Subscription `sub-bag-chronos`, Resource Group `rg-bag-chronos-prod`:

- [x] Resource Group `rg-bag-chronos-prod` (`westeurope`).
- [x] Azure SQL: Server `sql-bag-chronos-623bc0`, Database `sqldb-bag-chronos` (Basic 5 DTU).
- [x] App Service Plan `asp-bag-chronos-prod` (Linux, B1, Always-On).
- [x] App Service `app-bag-chronos-api` (.NET 8 Runtime, System-Managed Identity).
- [x] Static Web App `swa-bag-chronos-web` (Free, `westeurope`).
- [x] Key Vault `kv-bagchronos-623bc0` mit Secret `Sql--ConnectionString`.
- [x] Managed Identity am App Service, Rolle `Key Vault Secrets User` auf den Vault.

### AP 1.5 – CI/CD (US 1.2)

- [x] `backend-ci.yml`: Build + Test bei PRs gegen `main`.
- [x] `frontend-ci.yml`: Type-Check + Build bei PRs gegen `main`.
- [x] `backend-deploy.yml`: Push auf `main` → `azure/webapps-deploy@v3` mit OIDC.
- [x] `frontend-deploy.yml`: Push auf `main` → `Azure/static-web-apps-deploy@v1`.
- [x] App Registration `github-bag-chronos`, Federated Credentials für `main`, `pull_request`, `environment:production`. GitHub-Variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `FRONTEND_API_BASE_URL` + Secret `AZURE_STATIC_WEB_APPS_API_TOKEN`.

### AP 1.6 – Verifikation

- [x] `https://app-bag-chronos-api.azurewebsites.net/api/health` liefert `200 OK` (verifiziert 2026-04-29 nach Deploy `4a73f1d`).
- [x] Frontend (`https://calm-dune-04cf13f03.7.azurestaticapps.net`) lädt; CORS-Preflight aus dem Frontend-Origin liefert 204.
- [x] Lighthouse v12 (2026-04-30): Performance 98 / Accessibility 98 / Best Practices 96 / SEO 90. *Lighthouse hat die PWA-Kategorie in v12 entfernt; Installierbarkeit stattdessen direkt verifiziert:* `/manifest.webmanifest` (200, valides Manifest mit Name/Icons 192+512+maskable/`display=standalone`) und `/sw.js` (200, Service Worker via `vite-plugin-pwa` Workbox autoUpdate).
- [x] Push einer Trivialänderung deployed binnen <10 min (Backend-Deploy in ~3 min, Frontend in <2 min).

## Risiken & Hinweise

- **OIDC statt Publish Profile:** Publish Profiles sind langlebige Secrets und sollten vermieden werden; OIDC-Federation ist Stand der Technik und wird in der Azure-Anleitung erklärt.
- **Static Web App vs. App Service für Frontend:** Static Web App ist günstiger und kommt mit eingebautem CDN/SSL; sie wird empfohlen, falls keine serverseitigen Node-Endpunkte nötig sind.
- **SQL-Tier:** Basic/S0 reicht für Entwicklung. Vor Produktion auf mindestens S1 + georedundantes Backup heben.
- **Key Vault Cold Start:** Erste Anfrage nach Idle kann 1–2 s dauern. Health-Check separat halten.
