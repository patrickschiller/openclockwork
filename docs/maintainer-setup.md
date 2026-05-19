# Maintainer-Setup — OSS-Projekt mit privater Test-/Demo-Umgebung

> Maintainer-Doku. Beschreibt, wie OpenClockwork als öffentliches
> Open-Source-Projekt geführt wird und wie der Maintainer parallel eine
> eigene Azure-Test-/Demo-Umgebung betreibt — ohne ein zweites,
> dauerhaft zu synchronisierendes Code-Repo.

## Das Zielbild

Zwei Dinge sollen gleichzeitig stimmen:

1. **Ein öffentliches Repo** ist die kanonische Quelle des Projekts —
   Contributions, Releases, Issues, der ganze OSS-Betrieb.
2. **Der Maintainer betreibt eine eigene Umgebung** (Test/Demo) auf
   Azure, automatisch per GitHub Action deployt.

Der naheliegende Reflex — „ich klone das Repo privat, entwickle dort und
schiebe Fertiges per Pull Request ins öffentliche Repo" — ist fast immer
der **falsche** Weg. Warum, steht unten unter *Anti-Pattern*. Vorab die
zwei Kernfakten, die alles vereinfachen:

- **GitHub-Actions-Secrets sind auch in einem öffentlichen Repo
  verschlüsselt und unsichtbar.** Ein public Repo legt keine Secrets
  offen. Deshalb darf der Deploy-Workflow im öffentlichen Repo leben.
- **Sobald du einen Pull Request öffnest, ist sein Inhalt sichtbar.**
  „Privat entwickeln, dann per PR veröffentlichen" hält also ohnehin
  nichts geheim — der PR *ist* die Veröffentlichung.

## Kurzfassung der Empfehlung

> **Entwickle im Öffentlichen. Halte Secrets aus dem Repo. Trenne
> „das Projekt" von „meiner Installation davon" über GitHub
> Environments — nicht über ein zweites Code-Repo.**

Ein vollständiger privater Fork des Codes ist nur gerechtfertigt, wenn
echter, dauerhaft geheimer *Code* existiert. Bei OpenClockwork ist das
nicht der Fall: die Bicep-Templates sind generisch, Secrets liegen in
Key Vault / GitHub-Secrets, nicht im Code.

## Drei Modelle im Vergleich

| Modell | Code-Repos | Sync-Aufwand | Wann sinnvoll |
|---|---|---|---|
| **A — Alles öffentlich** | 1 (public) | keiner | Standardfall. Deploy-Workflow + IaC sind generisch, Secrets via GitHub Environments. |
| **B — Voller privater Fork** | 2 (private + public) | hoch, dauerhaft | Nur wenn dauerhaft geheimer *Code* existiert. Für OpenClockwork **nicht** nötig. |
| **C — Public + kleines privates Ops-Repo** | 2 (public + winziges privates) | gering | Wenn umgebungsspezifische Werte / interne Doku aus dem Blick sollen — das Ops-Repo enthält *keinen App-Code*. |

**Empfehlung für OpenClockwork: Modell A**, optional ergänzt um ein
kleines privates Ops-/Doku-Repo (Modell C) für interne Planungsdocs.

## Empfohlenes Modell für OpenClockwork

```
┌─────────────────────────────────────────────────────────┐
│  github.com/<user>/openclockwork   (PUBLIC)              │
│  · App-Code, libs, prisma                                │
│  · infra/azure/  (generische Bicep-Templates, OHNE Werte)│
│  · Dockerfile.*, docker-compose*.yml                     │
│  · .github/workflows/  (ci, deploy-azure, lighthouse,dco)│
│  · öffentlichkeitstaugliche Doku (README, architecture,  │
│    pitch, CONTRIBUTING, SECURITY)                        │
│                                                          │
│  GitHub Environment "demo":                              │
│  · Environment-Secrets: AZURE_CLIENT_ID / _TENANT_ID /   │
│    _SUBSCRIPTION_ID                                      │
│  · Protection Rule: nur Branch `main`, optional Reviewer │
└─────────────────────────────────────────────────────────┘
                          │ deployt nach
                          ▼
                  Azure (Resource Group, ACA, …)

  (optional, privat)
┌─────────────────────────────────────────────────────────┐
│  github.com/<user>/openclockwork-internal  (PRIVATE)     │
│  · interne Planungsdocs, base-instructions.md, Backlog   │
│  · KEIN App-Code — nur Notizen / umgebungsspezifische    │
│    Parameter-Vorlagen                                    │
└─────────────────────────────────────────────────────────┘
```

Der App-Code lebt **ausschließlich** im öffentlichen Repo. Es gibt
nichts zu synchronisieren.

## Wo Secrets leben — und warum ein public Repo sicher bleibt

| Secret-Art | Ablageort | Im public Repo sichtbar? |
|---|---|---|
| Azure-OIDC-Login (Client/Tenant/Subscription) | GitHub **Environment-Secrets** | nein — verschlüsselt |
| Laufzeit-Secrets (DB-URL, JWT, API-Keys) | Azure **Key Vault**, von der App über Managed Identity gelesen | nein — nie im Repo |
| Lokale Entwickler-Werte | `.env`, `infra/azure/main.bicepparam` — **gitignored** | nein — nie committed |
| Nicht-geheime Infra-Namen (RG, ACR …) | GitHub **Variables** *oder* Environment-Secrets | Variables: ja · Secrets: nein |

Regeln:

- **Niemals** ein echtes Secret in eine Datei committen — auch nicht in
  ein privates Repo. Privat ≠ sicher; verschlüsselte Secret-Stores sind
  sicher.
- Workflow-**Logs** eines public Repos sind öffentlich, aber GitHub
  maskiert Secret-Werte automatisch. Solange der Workflow Secrets nicht
  selbst ins Log `echo`t, leakt nichts.
- Was nicht geheim, aber „nicht für jeden" ist (Demo-URL, Resource-
  Namen): als Environment-**Secret** statt Variable ablegen — dann ist
  es ebenfalls unsichtbar.

## GitHub Environments — der richtige Hebel für dev/demo/prod

Ein **Environment** (Repo → Settings → Environments) ist die saubere
Trennung von Stages, ganz ohne zweites Repo:

- **Environment-scoped Secrets/Variables** — `demo` und `prod` haben je
  eigene Werte.
- **Protection Rules** — Required Reviewers (Deploy erst nach Freigabe),
  Wait Timer, *Deployment branches* (nur `main` darf nach `demo`).
- Im Workflow-Job: `environment: demo` — der Job zieht dann genau
  dieses Environment.

OIDC lässt sich zusätzlich **auf das Environment einschränken**: Der
Federated-Credential-Subject wird statt
`repo:<user>/openclockwork:ref:refs/heads/main` auf
`repo:<user>/openclockwork:environment:demo` gesetzt. Dann funktioniert
der Azure-Login *nur* aus einem Job, der im `demo`-Environment läuft.

## Branch Protection & Fork-PR-Sicherheit

Der häufigste Sorgenpunkt bei „Deploy-Workflow in einem public Repo":
*Kann ein fremder Pull Request meine Secrets abgreifen?*

Nein — wenn man die GitHub-Defaults nicht aushebelt:

- Bei einem **`pull_request`-Trigger aus einem Fork** laufen Workflows
  **ohne Secrets** und mit read-only `GITHUB_TOKEN`. Ein Fork-PR kann
  also keinen echten Deploy auslösen.
- **`pull_request_target`** läuft *mit* Secrets im Kontext des
  Basis-Repos — nur einsetzen, wenn man weiß was man tut, und niemals
  ungeprüften Fork-Code damit auschecken/ausführen.
- Der Deploy-Job hängt an `push` auf `main` **plus** `environment:`
  mit Branch-Restriction — er läuft nur, wenn ein Maintainer nach `main`
  merged.

Pflicht-Einstellungen auf `main`:

- Require pull request before merging (Review-Pflicht).
- Require status checks: `ci`, DCO.
- Keine Force-Pushes, keine direkten Pushes auf `main`.

## Der Arbeitsablauf konkret

### Als Maintainer

1. Feature-Branch im **öffentlichen** Repo: `git checkout -b feat/xyz`.
2. Entwickeln + lokal testen (lokaler Postgres via `docker compose`).
3. Push des Branches, Pull Request gegen `main`.
4. CI läuft (lint/typecheck/test/build + api-e2e). Review (auch
   Self-Review ist ok für Solo-Maintainer), dann Merge.
5. Merge auf `main` triggert `deploy-azure` → deployt ins
   `demo`-Environment. Optional erst nach deiner Freigabe (Required
   Reviewer am Environment).

→ Kein zweites Repo. Deine „DEV-Umgebung" ist der Feature-Branch +
deine lokale Maschine. Deine „Test-/Demo-Umgebung" ist das, wohin
`main` deployt.

### Als externer Contributor

1. Fork des öffentlichen Repos.
2. Branch + PR gegen `main` des Originals.
3. CI läuft **ohne** Secrets (Fork-PR) — Build/Test/Lint genügen.
4. Maintainer reviewt + merged. Erst der Merge deployt.

## Was privat bleibt — und wie

| Inhalt | Ablage |
|---|---|
| Echte Secrets | GitHub Environment-Secrets / Azure Key Vault — nie im Repo |
| Umgebungsspezifische Parameter (`main.bicepparam`-Werte) | lokal, gitignored — oder im privaten Ops-Repo |
| Interne Planungsdocs, `base-instructions.md`, Backlog | privates `*-internal`-Repo, privater Wiki, oder lokal |
| Demo-URL / Resource-Namen | Environment-Secrets (unsichtbar) statt Variables |

Wenn ein privates Repo gewünscht ist: **klein halten**. Es enthält
Notizen und Konfig-Vorlagen, **keinen App-Code**. Damit gibt es keinen
Merge-/Sync-Aufwand.

## Konkrete Einrichtung für OpenClockwork (Schritt für Schritt)

1. **Ein** öffentliches Repo `openclockwork`. App-Code, generische
   `infra/azure/`-Bicep, Workflows, public-taugliche Doku.
2. Interne Docs aussortieren: `base-instructions.md`, `docs/plans/`,
   `docs/backlog.md`, `docs/implementation-status.md` in ein privates
   `openclockwork-internal`-Repo (oder lokal). Im public Repo bleiben
   `README`, `CONTRIBUTING`, `SECURITY`, `docs/architecture.md`,
   `docs/pitch.md`, `docs/adr/`.
3. GitHub Environment `demo` anlegen; Environment-Secrets
   `AZURE_CLIENT_ID/_TENANT_ID/_SUBSCRIPTION_ID` dort hinterlegen.
   Protection Rule: Deployment branch nur `main`.
4. `deploy-azure.yml`: den Deploy-Jobs `environment: demo` geben.
5. OIDC-Federated-Credential auf
   `repo:<user>/openclockwork:environment:demo` umstellen (statt
   `:ref:refs/heads/main`).
6. `AZURE_WEB_FQDN` & Resource-Namen als Environment-Secrets statt
   Variables, falls die Demo-URL nicht öffentlich auffindbar sein soll.
7. Branch Protection auf `main` (PR-Pflicht, CI + DCO required).

## Anti-Pattern: der vollständige private Fork

Warum „privat entwickeln, per PR ins public Repo" nicht funktioniert
wie erhofft:

- **Es hält nichts geheim.** Ein PR legt seinen Diff offen — die
  Veröffentlichung passiert beim PR, nicht „später".
- **Permanente Sync-Steuer.** Zwei Code-Repos driften auseinander;
  jeder Public-Merge muss zurück in den privaten Fork gemergt werden.
  Das ist Dauer-Handarbeit und eine ständige Konflikt-Quelle.
- **PRs brauchen eine Fork-Beziehung.** Aus einem *unverwandten*
  privaten Repo kann man keinen PR ins public Repo öffnen — man landet
  beim manuellen Cherry-Picken über Git-Remotes.
- **Kein Sicherheitsgewinn.** Der Schutz kommt von verschlüsselten
  Secret-Stores und Environment-Regeln, nicht von der Repo-Sichtbarkeit.

Kurz: Ein privater Fork des *Codes* löst kein Problem, das nicht schon
durch GitHub Environments + Key Vault gelöst ist — er kostet nur
laufend Zeit.
