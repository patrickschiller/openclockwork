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

- [ ] Mono-Repo-Struktur: `backend/`, `frontend/`, `.github/workflows/`, `docs/`.
- [ ] `.gitignore` für .NET + Node + macOS/Windows.
- [ ] Root-`README.md` mit Kurzbeschreibung und Verweis auf `docs/plans/`.
- [ ] `.editorconfig` für einheitliche Whitespaces.

### AP 1.2 – Backend-Skelett (US 1.1, Vorbereitung Epic 2)

- [ ] `BagChronos.sln` mit Projekt `BagChronos.Api` (ASP.NET Core 8, Minimal APIs).
- [ ] Health-Endpoint `/api/health` (async).
- [ ] Swagger/OpenAPI aktiviert (Swashbuckle).
- [ ] CORS für Frontend-Origin konfigurierbar via `appsettings`.
- [ ] Konfiguration für SQL-Connection-String über Key Vault Reference (Platzhalter, real in App Service Config).

### AP 1.3 – Frontend-Skelett (US 1.3)

- [ ] Vite + React + TypeScript Projekt im `frontend/`.
- [ ] `vite-plugin-pwa` mit Manifest (Name, Icons, Theme-Color) und Service Worker (Workbox autoUpdate).
- [ ] Material UI v6 (MD3) als Komponentenbibliothek (`@mui/material`, `@emotion/*`).
- [ ] API-Client (axios oder fetch-Wrapper) mit Basis-URL aus `import.meta.env.VITE_API_BASE_URL`.
- [ ] Smoke-Page, die `/api/health` aufruft und Status anzeigt.

### AP 1.4 – Azure-Ressourcen (US 1.1)

Schritt-für-Schritt in [`docs/azure-setup.md`](../azure-setup.md). Diese AP umfasst:

- [ ] Resource Group `rg-bagchronos-prod` (Region z. B. `westeurope`).
- [ ] Azure SQL Server + Database `sqldb-bagchronos` (Basic/S0 für Start, später skalierbar).
- [ ] App Service Plan (Linux, B1 für Start).
- [ ] App Service `app-bagchronos-api` (.NET 8 Runtime).
- [ ] Static Web App `swa-bagchronos-web` ODER zweiter App Service `app-bagchronos-web` (Node) für PWA.
- [ ] Key Vault `kv-bagchronos` mit Secret `Sql--ConnectionString`.
- [ ] Managed Identity an App Service, Zugriff auf Key Vault als `get`/`list` für Secrets.

### AP 1.5 – CI/CD (US 1.2)

- [ ] `backend-ci.yml`: Build + Test bei PRs gegen `main`.
- [ ] `frontend-ci.yml`: Lint + Build bei PRs gegen `main`.
- [ ] `backend-deploy.yml`: bei Push auf `main` Build + `azure/webapps-deploy@v3` (OIDC, kein Publish-Profile).
- [ ] `frontend-deploy.yml`: bei Push auf `main` Build + Deploy zu Static Web App (`Azure/static-web-apps-deploy@v1`).
- [ ] OIDC-Federated-Credential im Azure-AD-App-Registration eingerichtet, Tenant/Subscription/ClientId in GitHub als Variables (nicht Secrets) hinterlegt.

### AP 1.6 – Verifikation

- [ ] `https://app-bagchronos-api.azurewebsites.net/api/health` liefert `200 OK`.
- [ ] Frontend lädt, ruft Health-Endpoint erfolgreich auf (CORS prüfen).
- [ ] Lighthouse PWA-Score > 90.
- [ ] Push einer Trivialänderung deployed binnen <10 min.

## Risiken & Hinweise

- **OIDC statt Publish Profile:** Publish Profiles sind langlebige Secrets und sollten vermieden werden; OIDC-Federation ist Stand der Technik und wird in der Azure-Anleitung erklärt.
- **Static Web App vs. App Service für Frontend:** Static Web App ist günstiger und kommt mit eingebautem CDN/SSL; sie wird empfohlen, falls keine serverseitigen Node-Endpunkte nötig sind.
- **SQL-Tier:** Basic/S0 reicht für Entwicklung. Vor Produktion auf mindestens S1 + georedundantes Backup heben.
- **Key Vault Cold Start:** Erste Anfrage nach Idle kann 1–2 s dauern. Health-Check separat halten.
