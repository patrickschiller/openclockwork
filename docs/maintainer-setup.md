# Maintainer-Setup: Public OSS + privates Internal-Repo

> Interne Maintainer-Dokumentation. Beschreibt die Aufteilung von
> OpenClockwork auf ein öffentliches OSS-Repo mit frischer Historie und ein
> privates Internal-Repo mit der vollständigen Entwicklungshistorie.

## Zielbild

OpenClockwork wird in zwei bewusst unterschiedlich verantwortete Repositories
aufgeteilt:

| Repository                               | Sichtbarkeit | Verantwortung                                                                         |
| ---------------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| `patrickschiller/openclockwork`          | public       | Kanonische Quelle für App-Code, öffentliche Beiträge, Releases und Issues             |
| `patrickschiller/openclockwork-internal` | private      | Interne Docs, private CI/CD-Workflows, Demo-Deployment und vollständige alte Historie |

Das Public-Repo beginnt mit einem frischen Initial-Commit. Dadurch enthält
seine Git-Historie keine früher gelöschten internen Dateien oder
umgebungsspezifischen Informationen.

Nach der Aufteilung gilt:

- App-Code wird im **Public-Repo** entwickelt und gemergt.
- Interne Dokumentation und private Automatisierung werden ausschließlich im
  **Internal-Repo** gepflegt.
- Das Internal-Repo übernimmt Public-Änderungen über automatisiert erzeugte
  Sync-PRs.
- Änderungen am App-Code werden nicht direkt im Internal-Repo vorgenommen.

## Warum kein vollständiger Mirror?

Ein Git-Mirror würde den Public-Dateibaum und die Public-Historie vollständig
ins Internal-Repo spiegeln und dabei interne Dateien oder interne Commits
überschreiben. Stattdessen verwendet OpenClockwork normale Git-Merges:

1. Ein einmaliger Baseline-Merge markiert den Public-Initial-Commit als bereits
   im Internal-Repo enthalten, ohne den internen Dateibaum zu verändern.
2. Danach werden nur neue Public-Commits in interne Sync-Branches gemergt.
3. Interne Dateien, die nie Teil der Public-Historie waren, bleiben unberührt.

## Repository-Inhalte

### Public: `openclockwork`

- `apps/`, `libs/`, `prisma/`, generische Infrastruktur und Docker-Dateien
- `README`, `LICENSE`, `NOTICE`, `CONTRIBUTING`, `SECURITY`, Code of Conduct
- öffentliche Issue- und Pull-Request-Templates
- keine internen Planungsdocs
- keine GitHub-Actions-Workflows

### Private: `openclockwork-internal`

- vollständiger Public-App-Code als regelmäßig synchronisierte Basis
- interne Docs, Architekturentscheidungen, Backlog und Arbeitspläne
- `base-instructions.md`, `CLAUDE.md`, `AGENTS.md`
- private GitHub Actions für CI, Deployment und Public-Synchronisierung
- umgebungsspezifische Vorlagen, aber keine echten Secrets

## Public-to-Internal-Synchronisierung

Der Workflow `.github/workflows/sync-public.yml` läuft:

- regelmäßig nach Zeitplan;
- manuell über `workflow_dispatch`.

Er führt folgende Schritte aus:

1. Internal-`main` auschecken.
2. Public-`main` als zusätzliches Remote abrufen.
3. Branch `sync/public-main` neu von Internal-`main` aufbauen.
4. Public-`main` hineinmergen.
5. Bei Änderungen einen internen Pull Request erstellen oder aktualisieren.

Der Workflow verarbeitet ausschließlich bereits nach Public-`main` gemergten
Code. Er checkt niemals ungeprüften Code aus öffentlichen Pull Requests aus und
führt ihn nicht mit privaten Secrets aus.

Voraussetzung im Internal-Repo:

- Unter **Settings → Actions → General → Workflow permissions**:
  `Read and write permissions` aktivieren.
- `Allow GitHub Actions to create and approve pull requests` aktivieren.

Bei Merge-Konflikten schlägt der Workflow sichtbar fehl. Der Konflikt wird
dann manuell in einem internen Sync-Branch gelöst; es erfolgt kein
automatischer Force-Merge.

## Private CI und Deployments

Private Workflows laufen ausschließlich im Internal-Repo. GitHub-Ereignisse
aus dem Public-Repo starten sie nicht automatisch.

Praktische Aufteilung:

- Public PRs werden lokal oder über einen später separat eingerichteten,
  minimal berechtigten externen CI-Dienst geprüft.
- Der interne Sync-PR führt die privaten CI-Checks erneut aus.
- Ein Merge des Sync-PRs nach Internal-`main` kann das private Demo-Deployment
  auslösen.

Falls private CI-Ergebnisse später als Required Status Check im Public-Repo
erscheinen sollen, muss eine dedizierte GitHub App oder ein fein berechtigtes
Token den Status für den Public-Commit über die GitHub API setzen.

## Secrets und Azure OIDC

Echte Secrets werden niemals committed, auch nicht in das private Repo.

| Secret-Art             | Ablage                                       |
| ---------------------- | -------------------------------------------- |
| Azure-OIDC-Werte       | GitHub Environment-Secrets im Internal-Repo  |
| Laufzeit-Secrets       | Azure Key Vault                              |
| lokale Entwicklerwerte | gitignored `.env`- und `.bicepparam`-Dateien |

Der Azure Federated Credential Subject verweist auf das Internal-Repo und das
Deployment-Environment:

```text
repo:patrickschiller/openclockwork-internal:environment:demo
```

Damit kann das Public-Repo keine privaten Deployments auslösen.

## Arbeitsablauf

### Öffentliche App-Code-Änderung

1. Branch oder Fork von `patrickschiller/openclockwork`.
2. Änderung entwickeln, testen und als Public-PR öffnen.
3. Review und Merge nach Public-`main`.
4. Der private Sync-Workflow erzeugt einen PR im Internal-Repo.
5. Private CI prüfen, internen PR mergen und Demo deployen.

### Interne Änderung

Interne Docs und private Workflows werden direkt über Branch + PR im
Internal-Repo geändert. Sie werden nie in Richtung Public-Repo synchronisiert.

## Einmalige Einrichtung

1. Bestehendes Repo in `openclockwork-internal` umbenennen und privat lassen.
2. Neues öffentliches Repo `openclockwork` mit bereinigtem Initial-Commit
   erstellen.
3. Public-Repo als Remote des Internal-Repos hinzufügen.
4. Einmaligen Baseline-Merge mit `--strategy=ours --allow-unrelated-histories`
   erstellen und nach Internal-`main` pushen.
5. Workflow-Berechtigungen für interne Sync-PRs aktivieren.
6. Azure OIDC und GitHub Environment-Secrets auf
   `openclockwork-internal` umstellen.
7. Public- und Internal-Branch-Regeln getrennt konfigurieren.

## Branch-Regeln

Für Public-`main`:

- Pull Request vor Merge verlangen.
- keine Force-Pushes.
- Commits mit DCO-Sign-off verlangen oder bei Review prüfen.
- Required Status Checks erst aktivieren, sobald ein Public-CI-Anbieter sie
  zuverlässig setzt.

Für Internal-`main`:

- Pull Request vor Merge verlangen.
- private CI-Checks verlangen.
- keine Force-Pushes.
