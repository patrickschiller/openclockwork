# Nachtest der Issue-Pakete

## Gesamtnachtest aller fünf Pakete

Dieser Abschnitt ist der **gemeinsame Einstieg für Patrick zu Hause**. Der Branch
`feat/44-manager-cockpit` enthält kumulativ **#42 + #41 + #43 + #45 + #44**.
Es sind weder Merges noch Releases oder fünf Branchwechsel erforderlich.
Die PR-Abhängigkeit bleibt **#46 → #47 → #48 → #49 → Cockpit-PR**; den exakten
abschließend geprüften Head nennen PR und Issue-Kommentar. Die zusätzliche
Cockpit-Migration ist additiv. Die bestehenden Benutzerdateien im Hauptcheckout
werden nicht für den Nachtest verwendet.

### Ein Branch, ein neuer lokaler Stack

Voraussetzungen: Git, Docker mit Compose, ein freier Port `18050` und ein Browser.
Die allgemeine Grundlage ist [LOCAL_DOCKER_TEST.de.md](LOCAL_DOCKER_TEST.de.md).
Die Builds laufen in Docker; auf dem Heimrechner ist dafür kein globales Nx
notwendig. **Keinen vorhandenen Stack, keine vorhandene `.env` und keine realen
Personaldaten verwenden.**

```bash
git fetch origin
git worktree add --detach ../openclockwork-all-five-manual origin/feat/44-manager-cockpit
cd ../openclockwork-all-five-manual
git rev-parse HEAD

cat > /tmp/openclockwork-all-five-compose.yml <<'YAML'
services:
  api:
    image: openclockwork-api:issues-all-local
  web:
    image: openclockwork-web:issues-all-local
YAML

all5() {
  TEST_WEB_PORT=18050 docker compose --env-file /dev/null \
    -p openclockwork-all-five -f docker-compose.test.yml \
    -f /tmp/openclockwork-all-five-compose.yml "$@"
}
all5 build
all5 up -d --wait
all5 exec -T -e NODE_ENV=development \
  -e OPENCLOCKWORK_SEED_CONFIRM_DATABASE=openclockwork_test \
  api node --import tsx prisma/seed.ts
curl --fail http://localhost:18050/api/health
```

Den Seed genau einmal auf diesem neuen Stack ausführen. Einstieg:
**<http://localhost:18050>**. Für die folgenden Fälle ausschließlich diesen Stack
und diese URL verwenden. Die älteren paketweisen Setup-/Worktree-/Port-Befehle
weiter unten sind **Alternativen**, nicht zusätzlich auszuführen. Insbesondere
nicht erneut seeden und nicht auf fünf andere Branches wechseln.

| Rolle           | Synthetisches Konto                 | Verwendung                                            |
| --------------- | ----------------------------------- | ----------------------------------------------------- |
| HR              | `hannah.roth@openclockwork.test`    | Vertragsbestätigung, HR-Stufe, Organisationssicht     |
| Manager         | `marc.becker@openclockwork.test`    | eigenes Team, Cockpit, Manager-Stufe, Stellvertretung |
| Fremder Manager | `stefanie.weiss@openclockwork.test` | Negativtest für fremdes Team                          |
| Beschäftigte    | `anna.mueller@openclockwork.test`   | Antrag, Bearbeitung, eigene Zeitbuchung/Korrektur     |
| Vertretung      | `bernd.schulz@openclockwork.test`   | Vertretung annehmen/ablehnen                          |

Initiales Passwort dieser lokalen synthetischen Konten: `openclockwork`.
Separate Browserprofile/private Fenster pro Rolle erleichtern den Wechsel.
Für Vertragsvergleiche bestätigt der Demo-Seed ausdrücklich synthetisch bekannte
Vertragsperioden ab dem Jahresbeginn; unbekannte ältere Historie bleibt unbekannt.
Für exakte Zahlen und freie Antragszeiträume die jeweils genannten zusätzlichen
Prüffälle verwenden, nicht beliebige schon belegte Seed-Tage.

### Geordnete gemeinsame Checkliste

Bei jeder ID-/Revisionsprüfung die IDs aus den Browser-Netzwerkdetails notieren.
Alle Schritte laufen auf `localhost:18050` und demselben kombinierten Branch.

1. **#42 – zurückgegebener Antrag:** Als Anna freien Urlaub beantragen; Marc
   gibt mit Begründung zurück; Anna öffnet den zugänglichen Entwurf, ändert Werte,
   speichert und reicht erneut ein. ID, Historie und Anlagen bleiben erhalten,
   Rückgabegrund und Name sichtbar. Danach den Vertretungs-Ablehnungsfall sowie
   die Sekunden-/DST-Fälle aus dem #42-Abschnitt prüfen. Fremdzugriff,
   Nicht-Entwurf und veraltete Revision müssen scheitern.
2. **#41 – echte Rahmenzeit-Freigabe:** Einen gewöhnlich erfassten, geschlossenen
   Eintrag außerhalb des konfigurierten Rahmens erzeugen. Manager-Entscheidung
   zuerst, danach separate HR-Bestätigung; Eintrag/Historie/Employee-Status
   stimmen in Genehmigungen, Cockpit und eigener Zeitübersicht überein. Eine
   noch laufende Buchung, fremdes Team oder doppelte Entscheidung darf nicht
   genehmigt werden. Konkrete Einrichtung/Negativfälle stehen bei #41.
3. **#43 – vorhandene Buchung korrigieren:** Anna wählt die bestehende Buchung
   explizit als Ziel, z. B. 08–16 → 08–17 und separat 09–16. Vorher/Nachher ist
   sichtbar; nach finaler notwendiger Genehmigung bleibt dieselbe Buchungs-ID
   und die Anzahl der Buchungen stabil. Manager-/HR-Stufen können auch aus dem
   Cockpit bedient werden. Andere Überlappungen und veraltete Zielrevisionen
   bleiben gesperrt; Rückgabe/Bearbeitung behält die Zielbindung.
4. **#45 – Soll/Ist:** Unter Mitarbeiter die HR-Vertragsperioden prüfen bzw.
   bestätigen; Wochen-/Monats-/benutzerdefinierter Arbeitszeitenfilter zeigt
   auch Personen mit 0 Ist. Die numerischen Fälle aus #45 nachrechnen (38 h Ist
   gegen 40 h Soll, Vertragswechsel mitten in der Woche, Feiertag/Halbtag).
   Ohne bestätigte Historie sind Soll/Differenz unbekannt, nicht 0. Eine spätere
   operative Profil-/Planänderung darf historische Vertragssnapshots nicht
   überschreiben. Für den SQL-Fixture-Block aus #45 kann die Abkürzung
   `dc45() { all5 "$@"; }` definiert werden; dessen separates Setup überspringen.
5. **#44 – volles Cockpit:** Als Marc über die Navigation das Manager-Cockpit
   öffnen. Buchungsstatus, bekannte Kernzeitpflicht und unbestimmbare Fälle
   getrennt prüfen; beide Genehmigungsarten direkt bearbeiten; stellvertretend
   **jetzt starten und rückwirkend buchen**, danach als Beschäftigte normal
   stoppen. Krankheits-/Ausfallaufzeichnung und normaler Abwesenheitsantrag
   im Namen der Person mit Audit prüfen. Mitarbeiterhistorie und Kalender
   für Monat, Quartal, ganzes Jahr und eigenen Zeitraum einschließlich aller
   Antragsstatus verwenden. Konkrete Vorbereitung, Rollen-/Concurrency- und
   Grenzzeitfälle stehen im #44-Abschnitt.

Gemeinsamer Abschluss: DE/EN wechseln, die Hauptaktionen per Tab/Enter bedienen,
Fehler-/Leerzustände kontrollieren und mit Stefanie/Employee fremde IDs sowie
nicht erlaubte Rollen versuchen. Historie ist keine Behauptung einer heutigen
Anwesenheit; ein laufender Timer ist keine physische Anwesenheitsmessung.

### Beenden und Fortsetzen ohne Datenverlust

```bash
all5 stop
# Später im selben Test-Worktree mit derselben all5-Funktion:
all5 up -d --wait
```

Nicht erneut seeden und kein `down -v` ausführen. Diese Anleitung ist ein
**manueller Nachtestplan**, keine Behauptung eines durchgeführten Heimtests.
Tatsächlich ausgeführte automatisierte Gesamt-Gates und ein gegebenenfalls real
laufender Browser-/Runtime-Smoke sind im letzten Paketabschnitt mit Ergebnis
getrennt dokumentiert.

## Paket #42 – zurückgegebene Anträge bearbeiten

- Issue: <https://github.com/patrickschiller/openclockwork/issues/42>
- Branch: `fix/42-returned-request-edit`, Basis: `9cfbc989cce97bde362821d1e2922951b2abb498`.
- Implementierungs-Worktree: `/Users/patrickschiller/openclockwork-issue-42`.
- Keine Releases, Tags, Versionsänderungen, Merges oder Deployments. Keine neue
  Migration erforderlich: Die vorhandenen Felder `updatedAt` und `workflowState`
  sichern Schreibzugriffe ab; das vorhandene Ereignis `Resubmitted` wird verwendet.

### Isoliertes lokales Setup

Die Grundlage ist [LOCAL_DOCKER_TEST.de.md](LOCAL_DOCKER_TEST.de.md).
Für diesen Nachtest **nicht** die bestehenden Solo-/Team-Projekte wiederverwenden.
Eigene Projekt-, Image-Namen und Port vermeiden Änderungen an anderen Teststacks.
Nur synthetische Daten verwenden; weder Produktivdaten importieren noch eine
vorhandene `.env` laden.

Vom Implementierungs-Worktree aus arbeiten, oder einen weiteren Test-Worktree
anlegen (der Hauptcheckout mit lokalen Dateien bleibt unberührt):

```bash
git fetch origin
git worktree add ../openclockwork-42-manual origin/fix/42-returned-request-edit
cd ../openclockwork-42-manual
```

Docker und Compose müssen laufen. Der lokale Override liegt außerhalb des Repos:

```bash
cat > /tmp/openclockwork-42-compose.yml <<'YAML'
services:
  api:
    image: openclockwork-api:issue42-local
  web:
    image: openclockwork-web:issue42-local
YAML

TEST_WEB_PORT=18042 docker compose --env-file /dev/null \
  -p openclockwork-issue42 -f docker-compose.test.yml \
  -f /tmp/openclockwork-42-compose.yml build

TEST_WEB_PORT=18042 docker compose --env-file /dev/null \
  -p openclockwork-issue42 -f docker-compose.test.yml \
  -f /tmp/openclockwork-42-compose.yml up -d --wait

TEST_WEB_PORT=18042 docker compose --env-file /dev/null \
  -p openclockwork-issue42 -f docker-compose.test.yml \
  -f /tmp/openclockwork-42-compose.yml exec -T \
  -e NODE_ENV=development \
  -e OPENCLOCKWORK_SEED_CONFIRM_DATABASE=openclockwork_test \
  api node --import tsx prisma/seed.ts
```

Seed nur einmal auf dieser leeren Team-Testdatenbank ausführen. Oberfläche:
<http://localhost:18042>, Healthcheck: <http://localhost:18042/api/health>.

| Rolle                   | Synthetisches Konto               | Verwendung                         |
| ----------------------- | --------------------------------- | ---------------------------------- |
| Beschäftigte            | `anna.mueller@openclockwork.test` | Antragstellerin                    |
| Führungskraft           | `marc.becker@openclockwork.test`  | Rückgabe/Genehmigung               |
| Vertretung/Fremdzugriff | `bernd.schulz@openclockwork.test` | Ablehnen/Annehmen, kein Eigentümer |
| HR                      | `hannah.roth@openclockwork.test`  | Urlaubskonto und Fremdzugriff      |

Das initiale lokale Seed-Passwort ist `openclockwork`, siehe Basisanleitung.
Separate Browserprofile/private Fenster je Rolle verwenden. Einen freien
Mo–Fr-Zeitraum desselben Jahres ohne Feiertage wählen; vorhandene Seed-Anträge und
Zeitbuchungen nicht überlappen. Für exakte 5/4,5-Tage-Erwartungen müssen die
Arbeitszeitregelung und das Urlaubskonto zu diesem Zeitraum passen.

### A. Führungskraft gibt zurück → bearbeiten → erneut einreichen

1. Als Anna unter **Anträge → Neuer Antrag** Urlaub ohne Vertretung für fünf
   Arbeitstage beantragen, Grund „Nachtest #42“ eintragen. Annas Name steht in der
   Maske und der Liste. In den Browser-Netzwerkdetails die Antwort-ID festhalten.
2. Als Marc unter **Genehmigungen** denselben Antrag prüfen: Annas Name steht im
   Eintrag und im **Verlauf**. Notiz „Bitte letzten Tag kürzen“ eingeben und
   **Zur Korrektur** wählen.
3. Als Anna Übersicht aktualisieren. **Entwurf · Antrag bearbeiten** mit Maus
   oder Tab/Enter öffnen. Erwartet: ursprüngliche Daten, Grund, Halbtagswerte und
   Vertretung (falls vorhanden) sind vorbelegt; Annas Name und der Rückgabegrund
   erscheinen. Der Antragstyp ist unveränderlich.
4. Letzten Tag oder Halbtagsauswahl ändern. **Entwurf speichern** wählen.
   Erwartet: weiterhin Entwurf, kein neuer Antrag, noch kein Genehmigungseingang.
   Erneut öffnen: geänderte Werte und Rückgabegrund bleiben vorhanden.
5. **Erneut einreichen** wählen. Erwartet: dieselbe ID wie in Schritt 1;
   `workflowState=PendingManager`, aktueller Manager neu zugeordnet; Tageszahl
   erneut berechnet (ein halber erster Tag bei fünf Arbeitstagen: 4,5 Tage).
   Alte Freigabe-, Entscheidungs-, HR- und Vertretungsannahmefelder sind leer.
6. Als Marc aktualisieren: genau ein Antrag mit neuen Werten. Im **Verlauf**
   bleiben Einreichung und Rückgabenotiz erhalten, zusätzlich „Erneut eingereicht“.
   Normal genehmigen; Annas Urlaubskonto darf den Antrag nicht doppelt zählen.

### B. Vertretung lehnt ab → bearbeiten → erneut einreichen

1. Als Anna neuen Urlaub in einem anderen freien Zeitraum mit Bernd als Vertretung
   beantragen. Als Bernd unter **Vertretungen** mit Notiz „Bin selbst weg“ ablehnen.
2. Als Anna den Entwurf öffnen: Werte und Ablehnungsgrund müssen sichtbar sein.
   Grund/Zeitraum/Halbtage ändern, Bernd erneut auswählen und erneut einreichen.
3. Erwartet: gleiche ID, `PendingSubstitute`, `substituteAcceptedAt=null`, noch
   kein aktueller Manager-Freigabeschritt. Bernd muss erneut ausdrücklich annehmen;
   danach folgt Marc. Alternativ Vertretung entfernen: direkt `PendingManager`.
4. Bei einem zurückgegebenen **Sonderurlaub** mit synthetischem PDF dasselbe
   durchführen: vorhandener Beleg muss vor/nach der Bearbeitung herunterladbar
   bleiben; Historie und Beleg-ID dürfen nicht verloren gehen.
5. Bei **Zeitkorrektur** Uhrzeiten prüfen: gespeicherte lokale Uhrzeiten werden
   vorbelegt. Neue Buchungsüberschneidung wird abgewiesen; eine Änderung außerhalb
   der Rahmenzeit erfordert weiterhin Sondergenehmigung und HR-Bestätigung.
6. Sprache auf Englisch umstellen: Bearbeiten/Speichern/Erneut einreichen,
   Mitarbeiterbeschriftung, Rückgabegrund und Wiedereinreichungsereignis sind
   übersetzt, keine neuen rohen i18n-Schlüssel.

### C. Negative und parallele Fälle

Die API-Aufrufe lassen sich über die Browser-Netzwerkdetails **des isolierten
Teststacks** wiederholen. Keine echten Bearer-Token in Dokumente/Issues kopieren.

`GET /api/requests/:id` liefert `updatedAt`. Bearbeiten:
`PATCH /api/requests/:id`; erneut einreichen: `POST /api/requests/:id/resubmit`.
Beide erwarten vollständige editierbare Werte, z. B.:

```json
{
  "expectedUpdatedAt": "<updatedAt aus der gelesenen Antwort>",
  "from": "2026-05-04T00:00:00.000Z",
  "to": "2026-05-08T00:00:00.000Z",
  "reason": "Nachtest",
  "substituteId": null,
  "halfDayStart": true,
  "halfDayEnd": false
}
```

Die Beispieldaten an den freien Testzeitraum anpassen.

| Fall                                                                                         | Erwartung                                                                                    |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Bernd, Marc oder HR ändern/reichen Annas Entwurf ein                                         | 403; Eigentümer wird ausschließlich aus Bearer-Identität geprüft, nicht aus Body-Feldern     |
| Kein Login                                                                                   | 401                                                                                          |
| Noch ausstehend, genehmigt, abgelehnt oder storniert statt `Draft`                           | 409; `status=Submitted` allein berechtigt nicht                                              |
| Enddatum vor Anfang, Urlaub über Jahresgrenze, nur Wochenende, ungültige Daten               | 400; unveränderter Entwurf                                                                   |
| Selbstvertretung, nicht vorhandene oder deaktivierte Vertretung                              | 400                                                                                          |
| HR reduziert Annas Urlaub unter den neu berechneten Bedarf                                   | 409 bei Speichern und Einreichen; 0,5 verfügbar erlaubt einen einzelnen halben Arbeitstag    |
| Überschneidung mit anderem aktivem Antrag oder anderem Entwurf                               | 409; ausschließlich die eigene ID ist aus der Prüfung ausgenommen                            |
| Unveränderten zurückgegebenen Urlaub bei exakt ausreichendem Konto einreichen                | Erfolg; eigene Reservierung wird weder bei Überschneidung noch beim Saldo doppelt gezählt    |
| Entwurf in zwei Tabs öffnen, in A speichern, in B mit altem `updatedAt` speichern/einreichen | 409; kein stilles Überschreiben, Fehler bleibt in der Maske, neu laden und erneut bearbeiten |
| Zweimal gleichzeitig denselben Entwurf einreichen                                            | genau ein Erfolg, ein 409, nur ein `Resubmitted`-Ereignis                                    |
| Zwei verschiedene Entwürfe parallel einreichen, Urlaub reicht nur für einen                  | genau einer erfolgreich; keine Überbuchung des Kontos                                        |
| Bereits laufende alte Managerentscheidung während Rückgabe + Wiedereinreichung               | alte Entscheidung scheitert mit 409, neue Werte/neuer Freigabezyklus bleiben bestehen        |

### D. Zeitkorrekturen: Sekunden und Herbst-Zeitumstellung (#42-Nachkorrektur)

Den Browser bzw. die Browser-Testumgebung ausdrücklich auf **Europe/Berlin**
stellen (z. B. DevTools → Sensors → Location/Timezone). Die Maske verwendet wie
bisher die lokale Browser-Zeitzone. Nur den isolierten synthetischen Teststack
nutzen, keine vorhandenen Zeitbuchungen überlappen und die Szenarien einzeln
ausführen; anschließend den jeweiligen Testantrag stornieren oder getrennte
synthetische Beschäftigte verwenden.

Für präzise Ausgangswerte als Anna über die Netzwerkdetails einen synthetischen
`POST /api/requests` mit Annas `employeeId`, `type=TimeAdjustment`, einem
Testgrund und den unten angegebenen `from`-/`to`-Werten anlegen. Der Server
erwartet ISO-Zeitpunkte, nicht offsetlose Ortszeiten. Als Marc zur Korrektur
zurückgeben (nicht genehmigen; die Sondergenehmigungs-/HR-Regeln gelten weiter).

| Ausgangsfall | ISO-Anfang → ISO-Ende | Lokale Anzeige Europe/Berlin |
| --- | --- | --- |
| Normale Sekunden/Millisekunden | `2026-06-15T06:10:23.456Z` → `2026-06-15T07:20:45.789Z` | 08:10:23.456 → 09:20:45.789 |
| Erstes Herbst-Vorkommen | `2026-10-25T00:10:23.456Z` → `2026-10-25T00:30:45.789Z` | 02:10:23.456 → 02:30:45.789, jeweils UTC+02:00 |
| Zweites Herbst-Vorkommen | `2026-10-25T01:10:23.456Z` → `2026-10-25T01:30:45.789Z` | dieselben Ortszeiten, jeweils UTC+01:00 |
| Über die Rückstellung | `2026-10-25T00:50:23.456Z` → `2026-10-25T01:10:45.789Z` | 02:50:23.456 UTC+02:00 → 02:10:45.789 UTC+01:00 |

1. Je Ausgangsfall Entwurf öffnen, **nur die Begründung ändern**, speichern,
   wieder öffnen und erneut einreichen. Netzwerk-Payload und Antwort für
   `PATCH /api/requests/:id` und `POST /api/requests/:id/resubmit` prüfen:
   `from`/`to` bleiben **exakt** wie in der Tabelle, einschließlich Sekunden,
   Millisekunden und Vorkommen; gleiche ID. Das rückstellungsübergreifende
   Intervall bleibt zulässig, obwohl die lokale Enduhrzeit kleiner ist.
2. Zum Vergleich den konkreten Fehlerfall mit
   `2026-10-25T01:30:00.000Z` als Anfang und z. B.
   `2026-10-25T02:30:00.000Z` als Ende prüfen: Bei einer reinen
   Begründungsänderung darf der Anfang **nicht** nach
   `2026-10-25T00:30:00.000Z` wechseln.
3. In einem zurückgegebenen Zeitkorrektur-Entwurf den Anfang auf
   **25.10.2026 02:30** ändern (Ende z. B. 03:30). Erwartet: verständlicher
   Zeitzonenhinweis und beschriftetes Feld **Von – Vorkommen**; kein stiller
   Standardwert. Speichern und Wiedereinreichen bleiben gesperrt, bis explizit
   gewählt wurde. **1. Vorkommen (UTC+02:00)** sendet
   `2026-10-25T00:30:00.000Z`, **2. Vorkommen (UTC+01:00)** sendet
   `2026-10-25T01:30:00.000Z`. Das unveränderte Ende bleibt exakt erhalten.
4. Dasselbe am Ende prüfen. Anfang 02:50 UTC+02:00, Ende 02:10 UTC+01:00:
   zulässig. Anfang auf das zweite Vorkommen umstellen: Ende liegt davor,
   deshalb gesperrt. Erneute Änderung des Ortszeitfelds verwirft eine vorherige
   Vorkommenswahl und verlangt bei Mehrdeutigkeit eine neue Auswahl.
5. Ortszeit **29.03.2026 02:30** oder ein leeres Zeitfeld eingeben:
   verständlicher Fehler; kein API-Aufruf und keine automatische Verschiebung
   auf 03:30. Ein normaler gültiger Zeitpunkt hebt die Sperre wieder auf,
   sofern das Ende nach dem Anfang liegt.
6. Auf Englisch wiederholen: **From/To – occurrence**, **Choose occurrence**,
   **Occurrence 1 (UTC+02:00)** / **Occurrence 2 (UTC+01:00)** und Erklärung sind
   übersetzt. Auswahl mit Tab und Pfeiltasten bedienen; Zeitfeld und Auswahl
   sind mit ihren jeweiligen Labels/Hinweisen verknüpft.

### Automatisch ausgeführte Gates

Stand: 07.11.2026. Tests verwenden eine eigene synthetische PostgreSQL-16-Instanz
(`openclockwork_test_42`, Loopback-Port 15442); keine vorhandene Datenbank wird
zurückgesetzt. Die UI-Regressionsprüfungen sind React-Testing-Library-Tests;
der oben beschriebene manuelle Docker-/Browser-Nachtest wurde nicht als bestanden
behauptet.

Ausgeführt mit Node `v26.12.1`, pnpm `9.15.9` (für diesen Worktree über
`/tmp/openclockwork-42-tools/node_modules/.bin` im `PATH`).

| Gate                                                                                                                                                                             | Ergebnis                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm nx e2e api-e2e --testPathPatterns='request-revision\|vacation-workflow\|half-day-vacation\|attachments\|bulk\|carry-over-expiry\|employee-account-access\|work-schedules'` | **75 Tests, 8 Suites bestanden**, einschließlich 20 neuer Revisionsfälle        |
| `pnpm nx run-many -t test -p web,shared --run`                                                                                                                                   | **Web: 190 Tests / 33 Dateien**, **Shared: 88 Tests / 7 Dateien bestanden**     |
| API-, Web- und Shared-Builds im Lauf `pnpm nx run-many -t build,typecheck,lint -p api,web,shared,api-e2e`                                                                        | **Alle vorhandenen Build-Targets erfolgreich**                                  |
| Lint im selben Lauf für API, Web, Shared und API-E2E                                                                                                                             | **0 Fehler**; 13 bestehende Warnungen in unveränderten Dateien                  |
| `pnpm nx run web:typecheck --force --skip-nx-cache`, danach `pnpm nx run-many -t typecheck -p api,web,shared,api-e2e`                                                            | **Alle vier Typechecks erfolgreich**                                            |
| `pnpm verify:api` mit der isolierten Test-`DATABASE_URL`                                                                                                                         | **Erfolgreich**, OpenAPI und generierter Client identisch zur gestagten Fassung |
| `git diff --check`                                                                                                                                                               | **Erfolgreich**                                                                 |

#### Nachkorrektur des unabhängigen P2-Befunds: Zeit-Roundtrip

Ergänzt am 07.11.2026, gleicher Branch/Worktree. **18 zusätzliche Regressionen**
(10 UI-Fälle und 8 Zeitauflösungsfälle). Die betroffenen Tests setzen ihre
Zeitzonen selbst und stellen sie wieder her; die Web-Läufe wurden zusätzlich
mit `TZ=UTC` gestartet, damit die Berlin-Fälle nicht zufällig von der
Host-Zeitzone abhängen.

| Gate | Ergebnis |
| --- | --- |
| Vier neue reine Begründungs-Roundtrips gegen die unveränderte `RequestsPage.tsx` aus `230dbb0` | **4/4 erwartungsgemäß fehlgeschlagen**: Sekundenverlust, zweites Vorkommen um eine Stunde verschoben bzw. gültiges rückstellungsübergreifendes Intervall gesperrt; danach korrigierte Datei wiederhergestellt |
| `TZ=UTC pnpm nx test web --run src/routes/RequestsPage.spec.tsx src/lib/local-date-time.spec.ts src/app/i18n.spec.tsx` | **29/29 bestanden** |
| `TZ=UTC pnpm nx test web --run` (finaler Code) | **208/208 Tests, 34 Dateien bestanden** |
| `TZ=UTC pnpm nx run-many -t test -p web,shared --run` | Web erfolgreich; **Shared 88/88 aus unverändertem Nx-Cache** |
| `pnpm nx run-many -t typecheck,lint -p web` | **Erfolgreich; 0 Fehler, nur 2 bestehende Warnungen** in `ThemeProvider.tsx` und `components/ui/alert.tsx`, keine neue Warnung |
| `pnpm nx build web` (nach beendetem Typecheck) | **Erfolgreich**, einschließlich PWA-Build |
| `git diff --check` | **Erfolgreich** |

Abgedeckt: erfolgreicher Ablauf Speichern → Wiederöffnen → Wiedereinreichen mit
neuem Versionswert, exakte Sekunden/Millisekunden, beide Herbst-Vorkommen,
unverändertes Gegenfeld, explizite DE/EN-Auswahl beider UTC-Offsets, identische
Validierungs-/Payload-Zeitpunkte, lokal früheres aber tatsächlich späteres Ende,
veraltete Auswahl nach weiterer Zeitänderung, leere Eingabe und Frühjahrslücke.
Die Hilfsfunktion wird zusätzlich für UTC, New York und eine halbstündige
Lord-Howe-Zeitumstellung geprüft.

Der erste CI-Nachlauf bestand 207/208 Web-Tests: Der neue Englisch-Test
übernahm unter Node 20 die in jsdom gespeicherte deutsche Sprachpräferenz, die
absichtlich Vorrang vor der Browsersprache hat. Die Testfixture isoliert den
Storage jetzt explizit wie die vorhandenen i18n-Tests; kein Anwendungscode
musste dafür geändert werden. Der folgende lokale Nachlauf bestand mit
Node **20.20.2** (nur per temporärem Tool-PATH, keine Repository-Konfiguration
geändert): `TZ=UTC pnpm nx test web --run --skip-nx-cache` —
**208/208 Tests in 34 Dateien**. Auch unter Node 26 wurden danach erneut
208/208 bestanden; Lint ist unverändert grün, Typecheck aus unverändertem Cache.

Nur Web und Anleitung geändert: keine API-, OpenAPI-, Client-Vertrags- oder
Datenbankänderung. Die bisherigen API-Gates bleiben oben dokumentiert; die
reguläre PR-CI prüft auch auf diesem Head erneut API-Synchronität und API-E2E.
Der manuelle Browser-Durchlauf aus Abschnitt D ist eine Anleitung, **kein**
behauptetes Testergebnis.

Beim kombinierten parallelen Build-/Typecheck-Zwischenlauf entfernte Vite das
von TypeScript ebenfalls verwendete Web-`dist`-Verzeichnis (`TS6305`). Der
anschließende erzwungene, separat ausgeführte Web-Typecheck und der separate
Vier-Projekt-Typecheck bestanden. Deshalb Build und Typecheck für einen Nachlauf
nacheinander starten. Es wurde dafür keine Projektkonfiguration geändert.
Weitere nicht blockierende Ausgaben: React-Router-Future-Hinweise,
Node-localStorage-Hinweis und veraltete Browserslist-Daten.

Reproduzierbare API-Testumgebung (ausschließlich neue synthetische Testinstanz):

```bash
docker run --name openclockwork-issue-42-db \
  -e POSTGRES_USER=openclockwork -e POSTGRES_PASSWORD=openclockwork \
  -e POSTGRES_DB=openclockwork_test_42 \
  -p 127.0.0.1:15442:5432 -d postgres:16-alpine

E2E_DATABASE_URL='postgresql://openclockwork:openclockwork@localhost:15442/openclockwork_test_42?schema=public' \
TZ=Europe/Berlin pnpm nx e2e api-e2e \
  --testPathPatterns='request-revision|vacation-workflow|half-day-vacation|attachments|bulk|carry-over-expiry|employee-account-access|work-schedules'
```

Wenn diese konkrete Testinstanz bereits existiert, nicht ein zweites Mal anlegen.
Die Test-Suite prüft den Testdatenbanknamen vor Migration/Reset. Ein vorhandenes
`DATABASE_URL` muss entfernt oder bewusst auf dieselbe isolierte Instanz gesetzt
werden; widersprüchliche Ziele werden abgewiesen.

### Stoppen, Daten erhalten

```bash
TEST_WEB_PORT=18042 docker compose --env-file /dev/null \
  -p openclockwork-issue42 -f docker-compose.test.yml \
  -f /tmp/openclockwork-42-compose.yml stop
```

Zum Fortsetzen denselben `up -d --wait`-Befehl verwenden, **nicht** erneut seeden.
Kein `down -v`: Das würde die Nachtestdaten löschen. Weitere Pakete ergänzen
diese Anleitung erst bei ihrer jeweiligen Implementierung.

## Paket #41 – Freigabe normaler Buchungen außerhalb der Rahmenzeit

### Branch, Abhängigkeit und isoliertes Setup

- Branch: `fix/41-outside-frame-approval`.
- Worktree: `/Users/patrickschiller/openclockwork-issue-41`.
- Basis ist der akzeptierte #42-Head `4ff247bc18adfc0b245d8dbb044f7968cf2a4678`.
- Der PR zielt für die vorhandene vollständige CI auf `main`, enthält deshalb
  **kumulativ #42 + #41** und hängt von PR #46 ab. Vorgesehene Reihenfolge:
  zuerst #46, danach #41; hier wird nichts gemergt. Der aktuelle obere Branch
  kann ohne Merge bereits beide Pakete gemeinsam testen.
- Additive Migration `20261107031000_time_entry_frame_approval`: zwei nullable
  Signaturfelder. Bestehende Buchungswerte, Revisionen und Historien bleiben
  erhalten; alte ausstehende Buchungen beginnen bei der Managerprüfung.

Grundlage weiterhin [LOCAL_DOCKER_TEST.de.md](LOCAL_DOCKER_TEST.de.md).
Einen separaten Stack verwenden; keine bestehenden Projekte/Volumes löschen.
Im #41-Worktree oder einem neuen Checkout dieses Branches:

```bash
git fetch origin
git worktree add ../openclockwork-41-manual origin/fix/41-outside-frame-approval
cd ../openclockwork-41-manual

cat > /tmp/openclockwork-41-compose.yml <<'YAML'
services:
  api:
    image: openclockwork-api:issue41-local
  web:
    image: openclockwork-web:issue41-local
YAML

TEST_WEB_PORT=18041 docker compose --env-file /dev/null \
  -p openclockwork-issue41 -f docker-compose.test.yml \
  -f /tmp/openclockwork-41-compose.yml build

TEST_WEB_PORT=18041 docker compose --env-file /dev/null \
  -p openclockwork-issue41 -f docker-compose.test.yml \
  -f /tmp/openclockwork-41-compose.yml up -d --wait

TEST_WEB_PORT=18041 docker compose --env-file /dev/null \
  -p openclockwork-issue41 -f docker-compose.test.yml \
  -f /tmp/openclockwork-41-compose.yml exec -T \
  -e NODE_ENV=development \
  -e OPENCLOCKWORK_SEED_CONFIRM_DATABASE=openclockwork_test \
  api node --import tsx prisma/seed.ts
```

Seed nur auf der **neuen leeren Datenbank** ausführen, beim Wiederaufnehmen
nicht erneut. Oberfläche: <http://localhost:18041>. API-Zeitzone im bestehenden
Test-Compose ist Europe/Berlin. Die synthetischen Rollen und das lokale Passwort
stehen im #42-Setup oben: Anna = Beschäftigte, Marc = zugewiesener Manager,
Hannah = HR, Bernd = anderer Beschäftigter. Separate Browserprofile verwenden.
Anna muss einem aktiven Manager mit Rolle **Manager** zugeordnet sein.
Rolle HRAdmin ersetzt diese erste Stufe ausdrücklich nicht.

### A. Tatsächliches Stempeln und Auffindbarkeit

1. Als Hannah unter Mitarbeitenden/Arbeitszeitplänen für Anna einen Plan wählen,
   dessen Rahmen die **aktuelle Server-Ortszeit nicht einschließt** (z. B.
   07:00–08:00, wenn gerade nachmittags getestet wird). Vorherige Zuordnung
   notieren. Keine laufende Session und keinen Tagesblock für den Testtag nutzen.
2. Als Anna **Buchen → Kommen**, kurz darauf **Gehen**. Es muss ein positives,
   abgeschlossenes Intervall entstehen. Während die Uhr läuft: kein Entscheiden
   möglich, auch nicht per direktem Freigabe-API-Aufruf.
3. In **Buchen** ist der eigene Freigabebereich sichtbar. Er benennt die
   Managerprüfung, Marc und den Ort **Genehmigungen → Zeitbuchungen** sowie
   die danach zwingende HR-Bestätigung. Es handelt sich um eine normale
   PWA-Zeitbuchung, nicht um einen neu anzulegenden Zeitkorrekturantrag.
4. Als Marc **Genehmigungen** öffnen: Im Bereich für Zeitbuchungen steht Anna
   mit Zeitraum und Status. Managerfreigabe ausführen. Erwartet:
   `PendingHr`, weiterhin Buchungsstatus `Pending`; noch kein HR-Endergebnis.
5. Als Hannah dieselbe Seite öffnen, HR bestätigen. Erwartet: dieselbe
   Buchungs-ID, `Approved`; Anna und Marc sehen nach Aktualisierung das Ergebnis.
   Der Verlauf zeigt beide tatsächlichen Akteure, Zeitpunkte, Ergebnisse und
   gegebenenfalls Notizen. Es entsteht kein zusätzlicher Antrag.
6. Auf Englisch wiederholen. Alle neuen Stufen, Hilfen, Aktionen, Fehler und
   Historienereignisse sind übersetzt; mit Tab/Enter bedienbar.

### B. Reproduzierbare Legacy-Ausgangsbuchungen

Zum gezielten Nachtest alter ausstehender Einträge können auf **diesem neuen
synthetischen Stack** drei feste Intervalle angelegt werden. Die Seed-Zeiten
liegen relativ zum aktuellen Datum; vorab prüfen, dass die folgenden historischen
Oktobertage frei sind. Bei Konflikt keine vorhandenen Daten ändern, sondern
freie Tage im SQL wählen. Die neuen Spalten absichtlich nicht setzen:
Das bildet die Altbestands-Situation nach der Migration ab.

```bash
TEST_WEB_PORT=18041 docker compose --env-file /dev/null \
  -p openclockwork-issue41 -f docker-compose.test.yml \
  -f /tmp/openclockwork-41-compose.yml exec -T db \
  psql -U openclockwork -d openclockwork_test -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "TimeEntry" (
  "id", "employeeId", "clockIn", "clockOut", "source", "status",
  "requiresApproval", "approvalMode", "note", "updatedAt"
)
SELECT fixture.id::uuid, employee.id, fixture.start_at::timestamptz,
  fixture.end_at::timestamptz, 'Pwa', 'Pending', true, NULL,
  'Synthetischer Nachtest #41', CURRENT_TIMESTAMP
FROM "Employee" employee
CROSS JOIN (VALUES
  ('00000000-0000-4000-8000-000000004101', '2026-10-05T03:00:00Z', '2026-10-05T05:00:00Z'),
  ('00000000-0000-4000-8000-000000004102', '2026-10-06T03:00:00Z', '2026-10-06T05:00:00Z'),
  ('00000000-0000-4000-8000-000000004103', '2026-10-07T03:00:00Z', '2026-10-07T05:00:00Z')
) AS fixture(id, start_at, end_at)
WHERE employee.email = 'anna.mueller@openclockwork.test'
ON CONFLICT ("id") DO NOTHING;
SQL
```

1. Ersten Eintrag durch Marc und Hannah wie oben freigeben. Erwartet:
   unveränderte ID/Zeiten, je eine Entscheidung, kein Bypass wegen
   `approvalMode=null`.
2. Zweiten Eintrag mit einer echten Notiz ablehnen; beide Ablehnungsstufen
   getrennt prüfen (bei Bedarf einen weiteren freien synthetischen Eintrag
   anlegen). Ohne nichtleere Begründung ist Ablehnen gesperrt. Nach Ablehnung
   ist weder Managerfreigabe noch HR-Bestätigung nachträglich erlaubt.
3. Beim dritten Eintrag als Hannah vorübergehend Annas Managerzuordnung
   entfernen oder einen nicht als Manager berechtigten Account zuweisen.
   Erwartet: erklärter blockierter Zustand mit Aufforderung, dass HR eine
   aktive Führungskraft zuordnet. Keine direkte HR-Bestätigung möglich.
   Gültige Zuordnung wiederherstellen: erst Manager, dann HR.
4. Nach Managerfreigabe eine **andere** aktive Führungskraft zuordnen:
   alte Führungskraft verliert Zugriff; alter HR-Tab darf nicht bestätigen.
   Der neue Manager muss den aktuellen Stand freigeben, anschließend HR.

### C. Negative Fälle, Änderungen und Konkurrenz

Netzwerkdetails ausschließlich im isolierten Stack verwenden. Keine Bearer-Token
in Dokumente oder Issues übernehmen.

`GET /api/timeentries/approvals?scope=own` liefert nur eigene Einträge;
`scope=review` liefert berechtigte Team-/HR-Sicht. Jeder Datensatz enthält
`revision`, `state`, `canDecide` und die Buchung. Entscheidung:

```http
POST /api/timeentries/<id>/approval
Content-Type: application/json

{
  "revision": 0,
  "stage": "Manager",
  "outcome": "Approve",
  "note": "Synthetisch geprüft"
}
```

Für HR die **neu gelesene** Revision und `stage=HR` verwenden.
Ablehnung: `outcome=Reject`, nichtleere Notiz. Verlauf:
`GET /api/timeentries/<id>/approval-history`.

| Versuch | Erwartung |
| --- | --- |
| Ohne Login | 401 |
| Beschäftigte lesen Review-Liste | 403; eigene Status-/Verlaufssicht bleibt möglich |
| Fremde Beschäftigte oder teamfremder Manager entscheiden/lesen Verlauf | 403 |
| `actorId` oder `employeeId` im Entscheidungsbody fälschen | Keine Berechtigungsänderung; Identität ausschließlich aus JWT |
| HR als Manager entscheiden / Manager als HR entscheiden | 403 |
| HR-Stufe vor Managerfreigabe | 409 |
| Eigene Buchung als Manager oder HR selbst freigeben | 403; andere zuständige Personen erforderlich |
| Offene, verworfene, bereits genehmigte/abgelehnte oder nicht genehmigungspflichtige Buchung entscheiden | 409 |
| Fehlende/negative Revision, ungültige Stufe | 400 |
| Veraltete Revision oder wiederholte Entscheidung | 409; keine zweite erfolgreiche Entscheidung, kein doppeltes Auditereignis |
| Zwei Managerentscheidungen oder zwei HR-Entscheidungen gleichzeitig | Genau ein Erfolg, einmal 409 |
| Buchungsänderung gleichzeitig mit Entscheidung auf derselben alten Revision | Genau ein Schreibvorgang erfolgreich; anderer 409 |
| Managerfreigabe, danach Projekt/Tätigkeit/Notiz ändern | Zurück zur Managerprüfung; alter HR-Stand 409, Verlauf enthält Invalidierung |
| Vollständig freigegebene Außenrahmenbuchung nachträglich ändern | Erneut Manager → HR, keine übernommene Endfreigabe |
| Freigegebene Außenrahmenbuchung aufteilen / Projektzeitbereich nachtragen | Betroffene Außenrahmensegmente erneut Managerprüfung; echte Rahmenzeitsegmente behalten normales Verhalten, alte Entscheidungen bleiben im Verlauf auffindbar |
| Abgelehnte Buchung aufteilen | Kein Reinwaschen: beide Segmente bleiben abgelehnt |
| Normale geschlossene Buchung innerhalb des Rahmens | Weiterhin direkt genehmigt; kein neuer Freigabeschritt |
| Separater Solo-Stack: Stempeln, manuell buchen, korrigieren, aufteilen | Unveränderte Solo-Regeln; keine Team-Freigabe alter/aktueller Daten möglich |

Hannah kann eigene Außenrahmenbuchungen nicht selbst bestätigen; dafür eine
zweite synthetische HR-Person anlegen. Ebenso braucht eine Führungskraft bei
eigenen Buchungen eine andere zugewiesene Führungskraft. Wenn diese Rollen fehlen,
ist zunächst die Organisationszuordnung zu vervollständigen, nicht eine Stufe zu
überspringen. Danach ursprüngliche Plan-/Managerzuordnungen wiederherstellen.

### Automatische Verifikation #41

Ausgeführt am 07.11.2026. Isolierter PostgreSQL-16-Container
`openclockwork-issue-41-db`, Loopback-Port `15441`, ausschließlich synthetische
Datenbanken `openclockwork_test_41` und `openclockwork_upgrade_41`. Keine
bestehende Datenbank zurückgesetzt. Toolchain: pnpm 9.15.9; API-/Web-Gesamttests
zusätzlich unter Node 20.20.2 (CI-Version), übrige lokale Gates unter Node 26.12.1.

| Gate | Tatsächliches Ergebnis |
| --- | --- |
| `TZ=Europe/Berlin pnpm nx e2e api-e2e --testPathPatterns=time-entry-approvals` | **27/27 neue API-/Service-Regressionen bestanden** |
| `TZ=Europe/Berlin pnpm nx e2e api-e2e` unter Node 20.20.2 | **331/331 Tests, 38 Suites bestanden** |
| `TZ=UTC pnpm nx run-many -t test -p web,shared --run --skip-nx-cache` unter Node 20.20.2 | **Web 234/234 in 35 Dateien**, **Shared 88/88 in 7 Dateien bestanden**, ohne Cache |
| `pnpm nx run-many -t typecheck,lint -p api,web,shared,api-e2e` | **Alle vier Typechecks und Lint erfolgreich**; 0 Fehler, 13 bestehende Warnungen in unveränderten Dateien, keine neue Warnung |
| `pnpm nx run-many -t build -p api,web,shared` getrennt von Typechecks | **Alle drei Builds erfolgreich**, einschließlich Web/PWA; unveränderter Shared-Build aus Nx-Cache |
| `pnpm verify:api` mit isolierter Test-`DATABASE_URL` | **Erfolgreich**; finale OpenAPI-Datei und generierter Client bleiben identisch zur gestagten Fassung |
| Baseline-Migrationen aus akzeptiertem #42 → `node ops/upgrade-smoke.mjs seed` → neue Migration → `node ops/upgrade-smoke.mjs verify` | **Erfolgreich**; echte historische Pending-Buchung bleibt mit Revision 7 und null Signaturmarkern erhalten, keine erfundene Freigabe |
| `git diff --check` | **Erfolgreich** |

Der Upgrade-Sentinel wurde in einer eigenen frischen Datenbank angelegt:
`PRISMA_BASE_DIR=/Users/patrickschiller/openclockwork-issue-42 pnpm prisma migrate deploy --config ops/prisma-upgrade-baseline.config.ts`,
danach Seed, Migration und Verifikation auf derselben isolierten Upgrade-URL.
Der erweiterte Upgrade-Smoke wird auch von der regulären PR-CI ausgeführt.

Abgedeckt sind reale Manager→HR-Entscheidungen und Ablehnungen, Pflichtnotiz,
Tokenidentität statt Body-Identität, Team-/Rollen-/Selbstfreigabegrenzen,
fehlende/inaktive/falsch berechtigte Manager, Neuzuordnung, Altbestand,
offene/terminale/in-frame/Solo-Einträge, doppelte/stale/parallele Entscheidungen,
Änderungsrennen, Änderung nach Endfreigabe, Split-/Projektbereichs-Invalidierung
und auffindbarer Verlauf selbst nach Verschieben eines alten Segments in den
Rahmen. Bestehende Solo-/Terminal-/Tagesblock-/Antragsfälle liefen vollständig mit.
Die Oberfläche wird mit React Testing Library geprüft, einschließlich DE/EN,
Mitarbeiterhinweisen, Rollenaktionen, Fehlern und Verlauf.

Die zusätzlichen historischen Listeneinträge erforderten ID-basierte statt
positionsabhängige Assertions in zwei neuen Tests. Ein Zwischenlauf unter
Node 26 zeigte außerdem einen einzelnen lokalen Socket-`ETIMEDOUT`; der
abschließende vollständige Node-20-Lauf bestand ohne Wiederholungslogik oder
Produktänderung dafür.

Der manuelle Docker-/Browser-Durchlauf aus dieser Anleitung wurde **nicht**
als durchgeführt oder bestanden gewertet. Keine Release-, Tag-, Versions-,
Merge- oder Deployment-Aktion.

Zum Stoppen mit Datenerhalt:

```bash
TEST_WEB_PORT=18041 docker compose --env-file /dev/null \
  -p openclockwork-issue41 -f docker-compose.test.yml \
  -f /tmp/openclockwork-41-compose.yml stop
```

Kein `down -v`, kein erneutes Seeden beim Fortsetzen. #43, #45 und #44 sind
noch nicht Bestandteil dieses Pakets.

## Paket #43 – bestehende Zeitbuchung gezielt korrigieren

### Branch, Abhängigkeiten und isolierter Teststack

- Branch: `fix/43-existing-entry-correction`.
- Worktree: `/Users/patrickschiller/openclockwork-issue-43`.
- Basis: akzeptierter #41-Head `dbe68f57a93ba26bdc315d31fd4b313586a4337b`.
- Kumulativ enthält der neue PR **#42 + #41 + #43**, Ziel weiterhin `main`
  für sämtliche CI-Jobs. Abhängigkeit und vorgesehene Reihenfolge:
  **PR #46 → PR #47 → #43-PR**. Keine dieser Änderungen wird hier gemergt.
- Additive Migration `20261107040000_targeted_time_corrections`: optionale
  Ziel-ID/Originalrevision/Originalsnapshot und ein Request-Link im Buchungsaudit.
  Bestehende fehlende-Buchung-Anträge bleiben ohne erfundene Zielbindung.

Weiterhin [LOCAL_DOCKER_TEST.de.md](LOCAL_DOCKER_TEST.de.md) verwenden, aber
separates Compose-Projekt, Images und Port. Keine vorhandenen Volumes löschen:

```bash
git fetch origin
git worktree add ../openclockwork-43-manual origin/fix/43-existing-entry-correction
cd ../openclockwork-43-manual

cat > /tmp/openclockwork-43-compose.yml <<'YAML'
services:
  api:
    image: openclockwork-api:issue43-local
  web:
    image: openclockwork-web:issue43-local
YAML

TEST_WEB_PORT=18043 docker compose --env-file /dev/null \
  -p openclockwork-issue43 -f docker-compose.test.yml \
  -f /tmp/openclockwork-43-compose.yml build

TEST_WEB_PORT=18043 docker compose --env-file /dev/null \
  -p openclockwork-issue43 -f docker-compose.test.yml \
  -f /tmp/openclockwork-43-compose.yml up -d --wait

TEST_WEB_PORT=18043 docker compose --env-file /dev/null \
  -p openclockwork-issue43 -f docker-compose.test.yml \
  -f /tmp/openclockwork-43-compose.yml exec -T \
  -e NODE_ENV=development \
  -e OPENCLOCKWORK_SEED_CONFIRM_DATABASE=openclockwork_test \
  api node --import tsx prisma/seed.ts
```

Seed nur einmal auf diesem **leeren synthetischen Stack** ausführen.
Oberfläche: <http://localhost:18043>; Server und Browser für die Beispiele auf
Europe/Berlin stellen. Synthetische Rollen aus den vorigen Paketen:
Anna beantragt, Marc ist zugewiesener Manager, Hannah bestätigt als HR,
Bernd prüft Fremdzugriff. Lokales initiales Seed-Passwort: `openclockwork`.
Keine echten Daten oder Tokens verwenden.

### A. Reproduzierbare bestehende 08:00–16:00-Buchungen

Zwei unterschiedliche, freie Tage verwenden, damit beide ursprünglichen
Issue-Beispiele separat durchspielbar sind. Die relative Seed-Zeiterfassung liegt
nahe dem Ausführungsdatum; vorab prüfen, dass die folgenden historischen Tage
frei sind. Bei Konflikt einen anderen freien Tag wählen, keine bestehenden
Buchungen löschen.

```bash
TEST_WEB_PORT=18043 docker compose --env-file /dev/null \
  -p openclockwork-issue43 -f docker-compose.test.yml \
  -f /tmp/openclockwork-43-compose.yml exec -T db \
  psql -U openclockwork -d openclockwork_test -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "TimeEntry" (
  "id", "employeeId", "clockIn", "clockOut", "source", "status",
  "approvalMode", "breakRules", "note", "updatedAt"
)
SELECT fixture.id::uuid, employee.id, fixture.start_at::timestamptz,
  fixture.end_at::timestamptz, 'Pwa', 'Approved', 'Team',
  '[{"afterMinutes":360,"breakMinutes":30},{"afterMinutes":540,"breakMinutes":45}]'::jsonb,
  'Synthetische Originalbuchung #43', CURRENT_TIMESTAMP
FROM "Employee" employee
CROSS JOIN (VALUES
  ('00000000-0000-4000-8000-000000004301', '2026-10-12T06:00:00Z', '2026-10-12T14:00:00Z'),
  ('00000000-0000-4000-8000-000000004302', '2026-10-13T06:00:00Z', '2026-10-13T14:00:00Z')
) AS fixture(id, start_at, end_at)
WHERE employee.email = 'anna.mueller@openclockwork.test'
ON CONFLICT ("id") DO NOTHING;
SQL
```

1. Als Anna die Buchungen unter **Buchen** ansehen, IDs, Zeiten, Anzahl und
   Saldo notieren. In den Oktoberbeispielen entsprechen 06:00Z–14:00Z lokal
   08:00–16:00. Mit dem gespeicherten Pausenschema sind das 480 Minuten brutto,
   30 Minuten Pause, 450 Minuten netto.
2. **Anträge → Neuer Antrag → Zeitkorrektur** öffnen. Explizit
   **bestehende Buchung korrigieren** statt **fehlende Buchung** wählen.
   Eine eigene vorhandene Buchung auswählen. Erwartet: Zeiten exakt vorbelegt,
   Original-ID und Originalrevision gebunden, verständliche
   **Vorher → Vorgeschlagen**-Gegenüberstellung.
3. Erste Buchung von **08:00–16:00 auf 08:00–17:00** ändern und einreichen.
   Bis zur finalen Genehmigung bleibt die Originalbuchung unverändert.
   Marc sieht Original-/Vorschlagswerte im Genehmigungskontext.
4. Als Marc innerhalb des normalen Rahmens genehmigen. Erwartet: **dieselbe
   Buchungs-ID**, keine zusätzliche Buchung, Revision um eins erhöht.
   Projekt/Auftrag, Tätigkeit, Notiz, Abrechenbarkeit und ursprüngliche
   Pausenregel bleiben erhalten. Bei diesem Pausenschema: 540 Minuten brutto,
   45 Pause, 495 netto; Saldoänderung **+45**, nicht eine doppelte 9-Stunden-Buchung.
5. Zweite Buchung separat auf **09:00–16:00** korrigieren und genehmigen.
   Erwartet: gleiche ID, 420 brutto, 30 Pause, 390 netto; Delta **−60**.
   Die erste Korrektur und alle anderen Tagesbuchungen bleiben unberührt.
6. Im Antrag/Verlauf stehen ursprünglicher und vorgeschlagener Stand, tatsächliche
   Entscheidung und verknüpftes Buchungsaudit. Das neue Audit enthält echten
   Akteur, Zeitpunkt, Vorher/Nachher und Request-ID; alte Auditereignisse bleiben.
7. Die Auswahl einer **fehlenden Buchung** separat in einem wirklich freien
   Intervall testen: kein Ziel erforderlich, nach endgültiger Freigabe entsteht
   genau eine neue Buchung wie bisher.

### B. Außenrahmen, Draft, Version und Datenschutz

1. Einen freien Vorschlag außerhalb Annas konfigurierten Rahmens wählen.
   Marc genehmigt zunächst nur den Antrag: **PendingHr**; die Buchung bleibt
   bis zu Hannahs Bestätigung unverändert. Erst HR aktualisiert dieselbe ID.
   Weder vorhandene alte #41-Genehmigungen noch eine deaktivierte HR-Checkbox
   dürfen die Prüfung der **neuen Werte** ersetzen.
2. Marc gibt einen gezielten Korrekturantrag zurück. Anna öffnet den Entwurf:
   Vorschlag, ursprünglicher Vergleich, Ziel-ID und Originalrevision bleiben
   erhalten. Nur Grund ändern, speichern, wieder öffnen und erneut einreichen.
   Ziel und gebundene Revision dürfen sich dabei nicht still auf einen
   inzwischen neuen Serverstand verschieben.
3. Das Ziel in einem anderen Tab nachträglich ändern/aufteilen oder über #41
   entscheiden, sodass seine Revision steigt. Alter Korrekturantrag:
   **409**, keine Änderung an Buchung, Antrag oder Audit durch diesen Versuch.
   Aktuellen Stand prüfen, alten Antrag stornieren und einen neuen mit der
   aktuellen Zielversion anlegen. Ziel/Originalrevision sind absichtlich auch
   im Entwurf unveränderlich.
4. Mit Bernds Token Annas fremde Ziel-ID verwenden: **403**, kein Zugriff.
   Ein gefälschtes `employeeId` im Body wird hingegen ignoriert: Maßgeblich ist
   ausschließlich die JWT-Identität. Mit einem zulässigen eigenen Ziel kann der
   Antrag deshalb erfolgreich sein; er gehört weiterhin der angemeldeten Person.
   Auswahl liefert ausschließlich eigene berechtigte Ziele.
   Offene, verworfene, abgelehnte und Solo-Buchungen sind keine zulässigen Ziele.
5. In einem getrennten Solo-Teststack die bestehenden direkten Owner-Korrekturen
   prüfen: unverändert. Team-Anträge erlauben keinen Umweg an den Solo-Owner-
   Berechtigungen vorbei.

### C. API-Negativ-/Konkurrenzfälle

Nur im isolierten Teststack aus den Browser-Netzwerkdetails wiederholen.
Keine echten Bearer-Token in Dokumente/Issues kopieren.

`GET /api/requests/time-adjustment-targets` liefert berechtigte eigene Ziele
einschließlich `revision`. Gezielter Antrag, z. B. für das erste Oktoberbeispiel:

```json
{
  "employeeId": "<Anna-ID; der Server verwendet ausschließlich die JWT-Identität>",
  "type": "TimeAdjustment",
  "from": "2026-10-12T06:00:00.000Z",
  "to": "2026-10-12T15:00:00.000Z",
  "targetTimeEntryId": "00000000-0000-4000-8000-000000004301",
  "expectedTargetRevision": 0,
  "reason": "Synthetischer Nachtest #43"
}
```

Die aktuelle Zielrevision verwenden, nicht blind die Beispiel-Null. Der Server
erfasst den Originalsnapshot selbst; ein mitgesendeter gefälschter
`targetTimeEntryBefore` ersetzt ihn nicht. Draft-Speichern/Wiedereinreichen aus
#42 erwartet weiterhin `expectedUpdatedAt`; Ziel und Zielrevision bleiben
gleich. Buchungsaudit zum Antrag:
`GET /api/requests/:id/time-entry-audit`, nur mit Antrags-Leseberechtigung.

| Fall | Erwartung |
| --- | --- |
| Kein Login | 401 |
| Fremde Ziel-ID | 403; keine Buchungsänderung |
| Gefälschtes `employeeId` im Body | Ignoriert; JWT-Identität ist maßgeblich. Mit zulässigem eigenem Ziel kann der Antrag erfolgreich sein, bleibt aber der angemeldeten Person zugeordnet |
| Offenes, verworfenes, abgelehntes oder Solo-Ziel | 409; nicht auswählbar |
| Ziel-ID ohne Revision oder umgekehrt / negative Revision | 400 |
| Zielbindung bei Urlaub/Homeoffice/Sonderurlaub | 400 |
| Anderes Ziel oder andere Originalrevision im Draft unterschieben | 400; kein Retargeting unter alter Genehmigung |
| Nur unveränderte eigene Zielbuchung überlappt | Zulässig; exakt diese ID ist ausgenommen |
| Andere Zeitbuchung desselben Tages überlappt den Vorschlag | 409; kein pauschales Tagesüberschreiben |
| Ziel fehlt, aber Vorschlag überlappt bestehende Buchung | Weiterhin 409 |
| Zielrevision zwischen Antrag und finaler Entscheidung verändert | 409; Antrag bleibt ausstehend, Ziel und Audit unverändert |
| HR vor erforderlicher Managerfreigabe / Selbstfreigabe / teamfremder Manager | Keine Materialisierung; 403/409 je nach Rolle/Stufe |
| Managerzuordnung vor finaler HR-Bestätigung geändert | Keine Nutzung der alten Managerfreigabe |
| Zweimal denselben Antrag genehmigen | Ein Erfolg, danach 403/409; eine Buchungsänderung/ein Anwendungsaudit |
| Bereits angewendeten gezielten Korrekturantrag stornieren | 409; Rückänderung nur durch einen neuen geprüften Korrekturantrag, nicht durch irreführendes Request-Storno |
| Zwei verschiedene, nicht überlappende Vorschläge für dieselbe Originalrevision parallel final genehmigen | Genau ein Ziel-Update; anderer Antrag 409, nicht still überschrieben |
| Parallel Clock-/Split-/Metadaten-/#41-Entscheidung | Gemeinsame Sperr-/Revisionsregeln; keine verlorene Änderung |
| Fehler während finaler Anwendung/Audit | Antrag, Request-Ereignis, Buchungsänderung und Buchungsaudit gemeinsam zurückgerollt |

### D. Sekunden, DST, Pausen und Nachvollziehbarkeit

Die #42-Tests aus Abschnitt D weiterhin ausführen. Zusätzlich bei einer gezielten
Korrektur eine eigene gültige Originalbuchung mit Sekunden/Millisekunden und
Herbst-Zeitumstellung verwenden: reine Grundänderung behält Zielrevision und
ISO-Zeitpunkte exakt; Vorher/Vorschlag zeigen die unterschiedlichen Instants.
Beide Vorkommen der Ortszeit müssen korrekt bleiben; geänderte mehrdeutige
Ortszeiten verlangen weiterhin eine ausdrückliche Auswahl. Ein gültiges
rückstellungsübergreifendes Intervall darf nicht wegen lokal früherem Ende
abgelehnt werden.

Pausen werden anhand der gespeicherten Buchungs-/Capture-Group-Regel neu
berechnet, nicht durch Überschreiben mit dem aktuellen Standardplan.
Andere Gruppenmitglieder/Projekte/Aufträge/Originalaudits bleiben erhalten.
DE/EN und Tab/Enter auf Moduswahl, Zielauswahl, Vergleich und Aktionen prüfen.
Der tatsächliche manuelle Browserdurchlauf wird nicht allein aufgrund dieser
Anleitung als bestanden gewertet.

### Automatische Verifikation #43

Ausgeführt am 07.11.2026 mit pnpm 9.15.9. Die neuen API-/UI-Regressionen
prüfen reale Services bzw. React Testing Library; die vollständigen Suites
wurden zusätzlich unter **Node 20.20.2** (CI-Version) ausgeführt. Sonstige lokale
Build-/Typgates: Node 26.12.1.

Isolierter PostgreSQL-16-Container `openclockwork-issue-43-db`,
Loopback-Port `15443`, neue synthetische Datenbanken
`openclockwork_test_43` und `openclockwork_upgrade_43`. Keine vorhandene
Datenbank zurückgesetzt.

| Gate | Tatsächliches Ergebnis |
| --- | --- |
| `pnpm nx e2e api-e2e --testPathPatterns=targeted-time-corrections` mit `TZ=Europe/Berlin` | **35/35 neue API-/Service-Fälle bestanden** |
| `TZ=Europe/Berlin pnpm nx e2e api-e2e` unter Node 20.20.2, einschließlich finaler Stornosicherung | **366/366 Tests, 39 Suites bestanden** |
| `TZ=UTC pnpm nx test web --run src/routes/RequestsPage.spec.tsx src/routes/AdminRequestsPage.spec.tsx src/components/timeentries/TimeEntryApprovals.spec.tsx src/app/i18n.spec.tsx src/lib/local-date-time.spec.ts` | **68/68 gezielte UI-/DST-Tests bestanden** |
| `TZ=UTC pnpm nx run-many -t test -p web,shared --run --skip-nx-cache` unter Node 20.20.2 | **Web 247/247 in 35 Dateien**, **Shared 88/88 in 7 Dateien bestanden**, ohne Cache |
| `pnpm nx run-many -t typecheck,lint -p api,web,shared,api-e2e` | **Alle vier Typechecks und Lint erfolgreich**; 0 Fehler, 13 bestehende Warnungen in unveränderten Dateien, keine neue Warnung |
| `pnpm nx run-many -t build -p api,web,shared`, erst nach abgeschlossenen Typechecks | **Alle drei Builds erfolgreich**, einschließlich Web/PWA; unveränderter Shared-Build aus Nx-Cache |
| `pnpm verify:api` mit isolierter Test-`DATABASE_URL` | **Erfolgreich**; finale OpenAPI-/Client-Dateien identisch zur gestagten Fassung |
| Akzeptiertes #41-Schema → erweiterte Upgrade-Sentinels → neue Migration → `node ops/upgrade-smoke.mjs verify` | **Erfolgreich**; alter Missing-Booking-Antrag bleibt ohne Ziel/Revision/Snapshot, bestehendes Buchungsaudit behält Akteur und Vorher/Nachher ohne erfundenen Request-Link |
| `git diff --check` | **Erfolgreich** |

Die vollständigen API-Tests umfassen #42-Draft/ABA-/Urlaubsregeln, #41-Freigaben,
Solo-/Terminal-/Split-/Bereichs-/Tagesblock-/Report-Flows. Die 35 neuen Fälle
belegen insbesondere Same-ID und stabile Anzahl für beide Issue-Beispiele,
Netto-/Saldo-Delta, Projekt-/Auftrags-/Pausen-/Capture-Snapshots, ausschließliche
Zielausnahme, Rollen/Eigentümer/Modus, unveränderliche Draft-Bindung,
stale/parallele Entscheidungen und echten Rollback nach bereits ausgeführtem
Buchungsupdate in sämtlichen finalen Approval-Routen. Reine Grundänderungen
behalten Originalversion und Sekunden/DST-Instants. Bereits angewendete gezielte
Korrekturen lassen sich nicht durch bloßes Request-Storno irreführend rückgängig
machen.

Die anfänglichen neuen Tests wurden an zwei bestehende Tatsachen angepasst:
Fixtures dürfen die PostgreSQL-Overlap-Constraint nicht verletzen; ungruppierte
Team-Summaries runden weiterhin auf ganze Minuten, während gespeicherte
ISO-Zeitpunkte unverändert millisekundengenau bleiben. Die Reviewer-UI-Testzone
ist explizit Europe/Berlin, unabhängig vom Host. Eine lokale Intl-Typerweiterung
ermöglicht die bereits von Browsern/Node 20 unterstützte Millisekundenanzeige,
ohne Projektkonfiguration oder Fachrundung zu ändern.

Der ausführliche manuelle Docker-/Browser-Nachtest oben wurde **nicht**
als durchgeführt oder bestanden behauptet. Keine Releases, Tags, Versionsbumps,
Merges, Deployments oder Release-Workflows.

Zum Stoppen mit Datenerhalt:

```bash
TEST_WEB_PORT=18043 docker compose --env-file /dev/null \
  -p openclockwork-issue43 -f docker-compose.test.yml \
  -f /tmp/openclockwork-43-compose.yml stop
```

Kein `down -v`, kein erneutes Seeden beim Fortsetzen. #45 und #44 folgen erst
nach unabhängiger Abnahme; hier noch nicht begonnen.

### Dokumentations-Nachtrag #43 vor Paket #45

Der reine Identitäts-Dokufix auf PR #48 ist
`53f961164245db69ac91912d3f123961ce846dd8` (eine Datei, +7/−3, kein Code).
Fremdes Buchungsziel → 403; ein gefälschtes Body-`employeeId` wird ignoriert,
das JWT ist maßgeblich und ein zulässiges eigenes Ziel kann erfolgreich sein.
Alle fünf Checks dieses exakten Heads waren grün:
[CI](https://github.com/patrickschiller/openclockwork/actions/runs/42333159388),
[DCO](https://github.com/patrickschiller/openclockwork/actions/runs/42333159341).
Keine erneuten lokalen Volltests für diese reine Textkorrektur.

## Paket #45 – datierter Soll/Ist-Vergleich der Arbeitszeiten

- Issue: <https://github.com/patrickschiller/openclockwork/issues/45>
- Branch: `feat/45-contract-period-comparison`.
- Worktree: `/Users/patrickschiller/openclockwork-issue-45`.
- Basis: `53f961164245db69ac91912d3f123961ce846dd8` (Paket #43 inklusive
  JWT-Identitäts-Dokukorrektur). Kumulativ #42 + #41 + #43 + #45.
- PR-Ziel bleibt `main`, damit alle CI-Gates laufen. Abhängigkeit und spätere
  Merge-Reihenfolge: **PR #46 → #47 → #48 → dieser PR**. Nicht selbst mergen.
- Additive Migration `20261107050000_employee_contract_periods`:
  bestätigte, selbständige Vertrags-/Arbeitstage-/Feiertagssnapshots und Audit.
  **Keine** Rückdatierung der aktuellen Stammdaten für Bestandsmitarbeiter.
  Lücken ergeben `targetMinutes: null`, `differenceMinutes: null` und die
  betroffenen `unknownDates` – niemals ein scheinbar korrektes Null-Soll.

### Fachliche Definitionen und Grenzen

- Der inklusive gewählte Zeitraum gilt gleichzeitig für Liste, Soll und Ist.
  Kalendergrenzen sowie angezeigte/exportierte Uhrzeiten verwenden die
  ausgewiesene Server-Zeitzone, hier `Europe/Berlin`, unabhängig vom Browser;
  Sekunden und DST werden als echte Zeitdauern ausgewertet.
- Ist = geschlossene Buchungen `Pending` oder `Approved`, netto nach der beim
  Erfassen gespeicherten Pausenregel. `Pending` zählt ausdrücklich **vorläufig**.
  Laufende, abgelehnte oder entwertete Buchungen zählen nicht. Übernachtungen
  werden an lokalen Tages-/Zeitraumgrenzen anteilig zerlegt. Künstliche
  Schnittgrenzen erhalten keine fremde Standortbeobachtung. Capture-Gruppen
  behalten ihren gemeinsamen Pausenabzug, auch wenn Teile außerhalb liegen.
- Soll = bestätigte Wochenstunden gleichmäßig auf die bestätigten Arbeitstage,
  je Tag gemäß bestehender Domain-Regel auf ganze Minuten gerundet.
  Beschäftigungsbeginn/-ende, freie Wochentage und Snapshot-Feiertage reduzieren
  das Soll. Genehmigter Urlaub/Sonderurlaub sowie erfasste Krankheit/Fortbildung
  reduzieren das Tages-Soll (Halbtage anteilig), **ohne** Ist-Gutschrift.
  Überlappungen werden pro Tag maximal einmal berücksichtigt. Doppelte
  Halbtagsmarkierungen ergeben nicht künstlich einen ganzen freien Tag.
  Homeoffice und Freizeitausgleich sind hier keine zusätzliche Soll-Befreiung.
- Differenz = **Ist − Soll ausschließlich dieses Zeitraums**, kein kumuliertes
  Zeitkonto und kein Eröffnungssaldo. Text und Farbe unterscheiden unter Soll,
  ausgeglichen, über Soll sowie „Prüfung empfohlen“ ab **+10 h**. Diese feste
  Zeitraum-Prüfschwelle ist keine gesetzliche Grenze oder Rechtsbewertung.
- HR bestätigt Vertragsperioden ausdrücklich. Der Stammdateneditor und mutable
  Arbeitszeitpläne bleiben operative Einstellungen; ihre spätere Änderung
  schreibt bestätigte Snapshots **nicht** um. Eine wirksame Vertragsänderung
  muss HR über einen neuen bestätigten Zeitraum hinzufügen. Eine explizite,
  revisionsgeprüfte Ablösung beendet nur die ausgewählte Vorperiode am Vortag;
  deren übrige Fakten bleiben samt Audit erhalten. Kein Überschreiben/Löschen
  bestätigter Fakten über diese API.
- Führungskräfte sehen sich selbst und unmittelbar zugeordnete Beschäftigte,
  HR organisationsweit (auch historische/inaktive Personen). Unberechtigte
  ausgewählte IDs werden serverseitig verweigert, nicht still ausgefiltert.
  PDF bleibt HR vorbehalten; ein PDF-Funktionsausbau gehört nicht zum Umfang
  dieses Soll/Ist-Pakets.

### A. Eigenständiges lokales Setup und synthetische Prüfdaten

Die Voraussetzungen aus [LOCAL_DOCKER_TEST.de.md](LOCAL_DOCKER_TEST.de.md)
verwenden, aber einen **eigenen** Stack auf Port `18045` starten. Keine bestehende
Datenbank, `.env` oder Produktivdaten verwenden:

```bash
git fetch origin
git worktree add ../openclockwork-45-manual origin/feat/45-contract-period-comparison
cd ../openclockwork-45-manual
cat > /tmp/openclockwork-45-compose.yml <<'YAML'
services:
  api:
    image: openclockwork-api:issue45-local
  web:
    image: openclockwork-web:issue45-local
YAML

dc45() {
  TEST_WEB_PORT=18045 docker compose --env-file /dev/null \
    -p openclockwork-issue45 -f docker-compose.test.yml \
    -f /tmp/openclockwork-45-compose.yml "$@"
}
dc45 build
dc45 up -d --wait
dc45 exec -T -e NODE_ENV=development \
  -e OPENCLOCKWORK_SEED_CONFIRM_DATABASE=openclockwork_test \
  api node --import tsx prisma/seed.ts
```

Oberfläche <http://localhost:18045>. Seed nur einmal auf der leeren Datenbank;
synthetische Rollen/Passwort wie bei #42: Hannah Roth (HR), Marc Becker (Manager),
Stefanie Weiss (fremdes Team), Anna Müller (Employee), Passwort `openclockwork`.
Der Demo-Seed bestätigt ausschließlich ausdrücklich synthetische Vertragsdaten
ab 1. Januar des Seed-Jahres. Er behauptet keine älteren Fakten und schreibt
bereits bestehende Vertragsperioden bei einem erneuten Seed nicht um.

Für reproduzierbare Zahlen unabhängig von sonstigen Seed-Buchungen zwei
**neue** synthetische Mitarbeiter ohne bestätigte Historie und fünf geschlossene
Testbuchungen anlegen. Diesen SQL-Block nur im eben angelegten Teststack ausführen,
auf einer frischen Instanz genau einmal. Keine vorhandenen Buchungen ändern:

```bash
dc45 exec -T db psql -v ON_ERROR_STOP=1 -U openclockwork -d openclockwork_test <<'SQL'
BEGIN;
INSERT INTO "Employee" ("id","personalNo","firstName","lastName","email",
  "passwordHash","role","timeModel","weeklyHours","annualLeaveDays","startDate",
  "holidayCalendar","managerId","updatedAt")
SELECT v.id::uuid,v.no,v.first_name,'Nachtest45',v.email,h."passwordHash",
  'Employee',v.model::"TimeModel",v.hours,30,DATE '2026-01-01','NONE',m."id",NOW()
FROM (VALUES
  ('00000000-0000-4000-8000-000000004501','MANUAL45-A','Vollzeit','manual45.a@openclockwork.test','Vollzeit',40),
  ('00000000-0000-4000-8000-000000004502','MANUAL45-B','Teilzeit','manual45.b@openclockwork.test','Teilzeit',20)
) AS v(id,no,first_name,email,model,hours)
JOIN "Employee" h ON h."email"='hannah.roth@openclockwork.test'
JOIN "Employee" m ON m."email"='marc.becker@openclockwork.test';
INSERT INTO "TimeEntry" ("id","employeeId","clockIn","clockOut","source",
  "status","requiresApproval","breakRules","note","updatedAt")
SELECT gen_random_uuid(),'00000000-0000-4000-8000-000000004501'::uuid,
  (v.day::date + TIME '08:00') AT TIME ZONE 'Europe/Berlin' AT TIME ZONE 'UTC',
  (v.day::date + v.finish::time) AT TIME ZONE 'Europe/Berlin' AT TIME ZONE 'UTC',
  'Manual','Approved',false,'[{"afterMinutes":360,"breakMinutes":30}]'::jsonb,
  'Synthetic #45 numeric fixture',NOW()
FROM (VALUES ('2026-11-16','16:30'),('2026-11-17','16:30'),
  ('2026-11-18','16:30'),('2026-11-19','16:30'),('2026-11-20','14:30')) AS v(day,finish);
COMMIT;
SQL
```

Erwartung: A hat 40,5 h Anwesenheit, 2,5 h Pause, **38 h netto**. B hat
**0 h**. Die Testbuchungen liegen nicht auf den Seed-Mitarbeiter-IDs.

### B. Unbekannte Historie → explizite HR-Bestätigung → Soll/Ist

1. Als HR **Arbeitszeiten → Benutzerdefiniert**, `16.11.2026` bis `20.11.2026`
   und die beiden Nachtest45-Personen auswählen. Beide stehen in der
   Vergleichstabelle, auch B ohne Buchungen. A: Ist `38 h`, B: `0 h`.
   Bei beiden Soll/Differenz `—`, Text zur fehlenden bestätigten Historie und
   konkrete unbekannte Tage. Kein grüner „ausgeglichen“-Eindruck.
2. Unter **Mitarbeiter → A bearbeiten → Bestätigte Vertragszeiträume** öffnen.
   Vorausgefüllte Profildaten sind ausdrücklich **unbestätigter Entwurf**.
   Zeitraum ab `2026-01-01`, offenes Ende, Beschäftigungsbeginn `2026-01-01`,
   40 Wochenstunden, Mo–Fr, Kalender `NONE`, keine Zusatzfeiertage und
   Notiz „Synthetischer Vertrag Nachtest45“ wählen. Explizite HR-Bestätigung
   setzen und bestätigen. Read-only-Historie mit HR-ID, Zeitpunkt und Revision 0.
   Für B analog 20 Wochenstunden, Mo–Fr, `Teilzeit` bestätigen.
3. Bericht erneut öffnen/aktualisieren, unveränderten Zeitraum/Personen prüfen:

   | Person | Soll | Ist netto | Differenz | Text |
   | --- | ---: | ---: | ---: | --- |
   | A Vollzeit | 40 h | 38 h | −2 h | Unter Soll |
   | B Teilzeit | 20 h | 0 h | −20 h | Unter Soll |

4. Woche/Monat/Benutzerdefiniert umschalten: angezeigte Grenzen und tatsächlich
   abgefragte API-Parameter müssen übereinstimmen. Die gleichen Personenfilter
   gelten für die Vergleichs- und Buchungstabelle. Sprache Englisch prüfen:
   „Target/actual comparison“, „Below target“, „Unknown“ und lokalisierte Zahlen;
   im Deutschen Dezimalkomma. Tastatur/Screenreader erkennt die Einordnung ohne Farbe.
5. Als Marc dieselben Personen auswählen: Zahlen identisch. Stefanie darf diese
   beiden fremden IDs weder in ihrer Auswahl sehen noch direkt per API abfragen.
   Ein normaler Employee kann die Admin-Auswertung nicht aufrufen. HR kann
   beide Teams lesen. Ein gefälschtes Body-`employeeId` erweitert keinen Zugriff;
   JWT und serverseitige Zuordnung bestimmen die Berechtigung.

### C. Wirksame Vertragsänderung und unveränderliche alte Planwerte

1. In A's Vertragspflege die bestehende Periode ausdrücklich **ablösen**,
   Beginn `2026-11-18`, 20 Wochenstunden/Mo–Fr, alle anderen Fakten unverändert,
   Notiz und Bestätigung setzen. Erwartung: alte Periode endet am `17.11.`,
   Revision 1, alte 40 h bleiben erhalten; neue Periode hat 20 h und Revision 0.
2. Bericht `16.–20.11.`: Soll `2×8 + 3×4 = 28 h`, Ist `38 h`, Differenz **+10 h**,
   Text „Prüfung empfohlen (ab +10 h)“. Der Hinweis ist keine Rechts-/Saldoaussage.
   `16.–17.11.` bleibt Soll `16 h`; kein rückwirkender 20-h-Vertrag.
3. Jetzt nur operative Profilwerte (z. B. 12 h/Woche, anderes Startdatum/Plan)
   und danach den zugewiesenen Arbeitszeitplan (Arbeitstage) ändern.
   Bericht erneut abfragen: bestätigtes Soll bleibt **28 h**, Historie/Fakten
   bleiben unverändert. Der Hilfetext erklärt, dass HR für echte Änderungen
   einen datierten Vertragszeitraum bestätigen muss.
4. Neue Periode aus Schritt 1 wiederum ab `19.11.` ablösen, 20 h/Mo–Fr,
   Zusatzfeiertag `2026-11-19`. Bericht: Soll `16 + 4 + 0 + 4 = 24 h`,
   Ist `38 h`, Differenz **+14 h**. Kein zusätzlicher Ist-Feiertagskredit.
5. Optional Beschäftigungsgrenzen an einer weiteren frischen Testperson:
   bestätigter Zeitraum `16.–20.11.`, Beschäftigung nur `18.–19.11.`,
   40 h/Mo–Fr/NONE. Soll **16 h**, ohne Buchungen Ist 0 und Differenz −16 h.
   Ohne deckende Bestätigung außerhalb des Vertragszeitraums bleibt Soll
   unbekannt – auch wenn aktuelle Profilwerte eine andere Historie nahelegen.

### D. Abwesenheiten, Halbtage, Übernachtungen und Negativtests

Für Urlaub/Sonderurlaub separate freie Termine/Testpersonen verwenden und die
bestehenden Manager-/HR-Abläufe wirklich abschließen, keine Pending-Anträge als
Genehmigung interpretieren. Vergleich jeweils für eine Mo–Fr-Woche ohne weitere
Feiertage mit bestätigten 40 h/Mo–Fr-Vertragsdaten:

| Konstellation | Erwartetes Soll | Ist-Verhalten |
| --- | ---: | --- |
| Keine Abwesenheit | 40 h | nur Netto-Buchungen |
| Ein ganzer genehmigter Urlaubstag | 32 h | keine Urlaubsgutschrift |
| Ein genehmigter halber Urlaubstag | 36 h | keine Halbtagsgutschrift |
| Derselbe Tag zugleich mit ganzer Krankheit/Fortbildung | 32 h | nicht nochmals reduzieren |
| Genehmigter ganzer Sonderurlaubstag | 32 h | keine Sonderurlaubsgutschrift |
| Nur beantragter/zurückgegebener/abgelehnter Urlaub | 40 h | keine Befreiung |
| Homeoffice oder Freizeitausgleich | 40 h | keine zusätzliche Befreiung |
| Ein freier Samstag/Sonntag außerhalb der Arbeitsmaske | 0 h für diesen Tag | tatsächliche Arbeit bleibt Ist |

Überlappende Halbtagsdatensätze sind über normale Antragserfassung ggf. bereits
fachlich verhindert; die API-Regression prüft zusätzlich Legacy-Überlappungen
mit max. Tagesabdeckung statt doppelter Gutschrift.

- Geschlossene Buchung von Vorabend 23:00 bis Folgetag 02:00 ohne Pausenregel:
  Tagesfilter des Folgetags enthält **2 h** (nicht 0 oder 3 h).
- Herbstumstellung Berlin `2026-10-25T00:30:00Z` bis
  `2026-10-25T02:30:00Z`: **2 h** trotz mehrfacher 02-Uhr-Stunde.
  Teilintervallfilter muss echte Zeitanteile erfassen. Gemeinsame Capture-Gruppe
  erhält ihren Pausenabzug nur einmal und bei Ausschnitten anteilig.
- Laufende Buchung: Zähler „Offene Buchungen (nicht enthalten)“ steigt, keine
  laufenden Minuten ins Ist. Rejected/voided ebenfalls nicht enthalten.
  Geschlossenes Pending zählt nur mit dem sichtbaren Vorläufig-Hinweis.
- Vertrag ohne ausdrückliche Bestätigung/mit leerer Notiz, unmöglichem Datum,
  Ende vor Beginn, ungültiger Wochenmaske oder >24 h je Arbeitstag: **400**,
  keine Periode/kein Audit. Ein unverknüpfter überlappender Zeitraum: **409**.
- Ablösen in zwei Browser-Tabs mit derselben Revision: genau eine Änderung
  erfolgreich, die zweite **409**. Nach Neuladen stimmen Endgrenzen und Fakten;
  keine doppelten Perioden. Fremde Perioden-ID als Ablöseziel: **409**.
- Manager/Employee lesen oder bestätigen `/api/employees/:id/contract-periods`:
  **403**, unabhängig vom Body. HR-Historie ist kein allgemeiner Mitarbeiterzugang.
- Manager fordert `/api/reports/working-times?from=2026-11-16&to=2026-11-20&employeeId=<fremde-ID>`
  oder gemischte erlaubte/fremde `employeeIds` an: **403**, auch bei 0 Buchungen.
  Manager-PDF-Aufruf: **403**; hier kein stiller Export aller Personaldaten.
- Bestehende #42-Draft-Sekunden-/DST-Roundtrips sowie #41/#43-Genehmigungen
  weiter anhand ihrer vorherigen Abschnitte prüfen; Solo-Verhalten unverändert.

### E. Tatsächlich ausgeführte Gates

Der manuelle Docker-/Browser-Ablauf oben ist eine Nachtestanleitung und wird
**nicht** als hier ausgeführt behauptet. Die folgenden automatisierten Prüfungen
laufen mit **Node 20.20.2**, **pnpm 9.15.9**, `TZ=Europe/Berlin` auf dem isolierten
Worktree; keine Produktivdaten oder vorhandenen Teststacks werden benutzt.

| Gate | Tatsächliches Ergebnis |
| --- | --- |
| `pnpm nx run api-e2e:e2e --runInBand --skip-nx-cache` | **415/415 Tests in 41 Suites bestanden** (finale API-Fassung) |
| Neue API-Regressionen | **33 Vertragsfälle + 16 Vergleichsfälle** (im finalen Volltest): echte datierte Fakten, Nullbuchungen, Teilzeit/Arbeitsmaske, Feiertage, Genehmigungs-/Halbtagsunion, Beschäftigungsgrenzen, Historienlücken, unveränderte Snapshots nach Profil-/Planänderung, Scope/Session/Solo-Wechsel, Rennen/Stale/Audit-Rollback, Netto-/Capture-Gruppen, Mitternacht/DST/Sekunden und physische Standortgrenzen |
| `pnpm nx test web --run --skip-nx-cache` | **267/267 Tests, 37 Dateien bestanden**, inklusive #42-Sekunden-/Fold-Roundtrip, #41/#43-Oberfläche und Berichts-/CSV-Zeitzone unabhängig vom Browser |
| `pnpm nx test shared --run --skip-nx-cache` | **88/88 Tests, 7 Dateien bestanden** |
| `pnpm nx run api-e2e:test-ops` | **27/27 Operator-/Datenbankziel-Tests bestanden** |
| `pnpm nx run-many -t typecheck -p api,web,shared,api-e2e` | **Alle vier erfolgreich**; Web separat erzwungen, API/API-E2E nach letzten Änderungen erneut geprüft |
| `pnpm nx run-many -t lint -p api,web,shared,api-e2e` | **0 Fehler**, ausschließlich **13 bestehende Warnungen**, keine neue Warnung |
| `pnpm nx run-many -t build -p api,web,shared --skip-nx-cache` | **Alle drei Produktions-Builds bestanden**, einschließlich Web-PWA; API nach letzten Serviceänderungen separat nachgebaut |
| `pnpm verify:api` | **Bestanden**, OpenAPI und generierter Client reproduzierbar identisch zur gestagten Fassung |
| Realer DB-Upgrade von befülltem #43-Stand (26 → 27 Migrationen) | **Bestanden**; Sentinel-Daten/Audits erhalten, bestehende Beschäftigte haben weiterhin **0 erfundene Vertragsperioden / 0 erfundene HR-Audits** |
| Demo-Seed zweimal auf separater leerer Testdatenbank | **Bestanden**, nach beiden Läufen **9 Vertragsperioden / 9 Audits**, kein Überschreiben |
| SQL-Fixture aus Abschnitt A auf dieser separaten Testdatenbank | **Ausgeführt**: zwei Mitarbeiter und fünf Buchungen erfolgreich eingefügt; kein manueller Browsernachtest daraus abgeleitet |
| `git diff --check` | **Bestanden** |

Die neue Migration ist additiv; keine alten Migrationen, Versionsnummern, Tags,
Releases oder Deployments geändert. CI-Links und exakter finaler Head stehen im
PR und abschließenden Issue-Kommentar, damit spätere Folgezweige diese Evidenz
nicht einem anderen Commit zuschreiben.

Frühe Prüfläufe fanden einen ungültigen Mehrfach-Open-Testaufbau (durch den
bestehenden DB-Unique-Index korrekt verhindert), einen zwischenzeitlichen
Payload-TypeScriptfehler und eine exakte Float-Gleichheitsannahme im bestehenden
Mitternachts-Snapshot-Test (eine ULP Differenz). Korrigiert sind der Aufbau,
der Payload-Typ und eine Toleranz unter einer Mikrosekunde, nicht die fachlichen
Status-/Berechtigungsprüfungen. Lokale HTTP-Ausreißer (502/403/Loopback-Timeout)
bei häufig neu geöffneten Supertest-Ports führten zur expliziten, einmaligen
Loopback-Listener-Lebensdauer pro Suite; keine Retries oder schwächeren
HTTP-Assertions. Die vollständigen Nachläufe mit diesem Listener waren grün.
Builds und Typechecks liefen getrennt, ohne `dist`-Rennen.

Stoppen ohne Datenverlust: `dc45 stop`. Zum Fortsetzen `dc45 up -d --wait`;
kein erneuter Seed und kein `down -v`.

## #44 – vollständiges Manager-Cockpit

**Branch:** `feat/44-manager-cockpit`, auf dem akzeptierten #45-Head
`3a2361d0d2d25f23ce030ce751cf67873aedbf8f`. Das Paket umfasst die zentrale
Teamübersicht, **beide** Genehmigungsarten, echte stellvertretende Zeiterfassung
und Abwesenheiten sowie Detailhistorie **und** Kalender. Der PR ist kumulativ;
Reihenfolge **#46 → #47 → #48 → #49 → Cockpit-PR**, alle gegen `main` für die
bestehende CI. Nicht vor den Abhängigkeiten einzeln mergen.

### A. Gemeinsames Setup und reproduzierbare Person

Den Abschnitt **„Gesamtnachtest aller fünf Pakete“ ganz oben** verwenden:
`all5`, Projekt `openclockwork-all-five`, Port **18050**, einmaliger synthetischer
Seed. Kein weiterer Stack, Branchwechsel oder Seed notwendig. Die folgenden
SQL-Befehle sind ausschließlich Fixture-Vorbereitung auf **dieser neuen lokalen
Testdatenbank**. Keine Produktivdaten, keine künstliche rückwirkende
Vertragshistorie. Das Demo-Passwort wird nur aus dem synthetischen Seed übernommen.

Dieser einmalige Block legt eine zusätzliche Person im Team von Marc an.
Die ungewöhnliche Sieben-Tage-Kernzeit ist eine **ausdrückliche Testannahme**,
kein allgemeines Anwesenheitsmodell. Damit ist der Kernzeitfall auch am Wochenende
prüfbar. Zwischen 00:01 und 23:58 Berliner Zeit gilt die bekannte Kernzeit.

```bash
all5 exec -T db psql -v ON_ERROR_STOP=1 -U openclockwork -d openclockwork_test <<'SQL'
BEGIN;
INSERT INTO "WorkSchedule" (
  "id", "name", "frameStart", "frameEnd", "workingDays", "breakRules", "updatedAt"
) VALUES (
  '00000000-0000-4000-8000-000000004402', 'MANUAL44 known seven-day core',
  '07:00', '18:00', 127,
  '[{"afterMinutes":360,"breakMinutes":30}]'::jsonb, CURRENT_TIMESTAMP
);
INSERT INTO "WorkScheduleCoreTime" ("id", "scheduleId", "label", "start", "end", "weekdays")
VALUES (
  '00000000-0000-4000-8000-000000004403',
  '00000000-0000-4000-8000-000000004402', 'Explicit synthetic core', '00:01', '23:58', 127
);
INSERT INTO "Employee" (
  "id", "personalNo", "firstName", "lastName", "email", "passwordHash", "role",
  "timeModel", "weeklyHours", "annualLeaveDays", "startDate", "holidayCalendar",
  "managerId", "workScheduleId", "updatedAt"
)
SELECT '00000000-0000-4000-8000-000000004401', 'MANUAL44', 'Cockpit', 'Test',
  'cockpit.test@openclockwork.test', seed."passwordHash", 'Employee', 'Teilzeit', 35, 30,
  DATE '2024-01-01', 'NONE', manager."id", '00000000-0000-4000-8000-000000004402',
  CURRENT_TIMESTAMP
FROM "Employee" seed CROSS JOIN "Employee" manager
WHERE seed."email" = 'anna.mueller@openclockwork.test'
  AND manager."email" = 'marc.becker@openclockwork.test';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Employee" WHERE "personalNo" = 'MANUAL44') THEN
    RAISE EXCEPTION 'Expected synthetic seed accounts are missing';
  END IF;
END $$;
COMMIT;
SQL
```

**Zuerst ohne Vertragsbestätigung:** Marc öffnet **Manager-Cockpit**, wählt
„Cockpit Test“. Erwartet: keine erfundene Fehlzeit; Vertrag/Anwesenheitspflicht
ist nicht bestimmbar. Ein laufender Timer wäre trotzdem als Buchungsfakt sichtbar.

Danach Hannah unter **Mitarbeiter → Cockpit Test → Vertragsperioden**:
Bestätigung ab **1. Januar des aktuellen Jahres**, Beschäftigungsbeginn
01.01.2024, 35 Wochenstunden, Teilzeit, **alle sieben Arbeitstage**, Kalender
**NONE**, keine zusätzlichen Feiertage. Aussagekräftige Bestätigungsnotiz und
explizite Bestätigung verwenden; Details des HR-Formulars stehen in #45.
Es werden nur die für diesen Test ausdrücklich bekannten Fakten bestätigt.
Marc aktualisiert: während der bekannten Kernzeit und ohne entschuldigende
Abwesenheit steht nun ein textlicher Hinweis auf die fehlende Buchung.
35 Wochenstunden ergeben hier **5 h Soll pro Arbeitstag**, nicht 7 oder 8 h.

### B. Heutiger Status, Pflicht und automatische Aktualisierung

1. Ohne Timer und innerhalb der bekannten Kernzeit: erforderliche Buchung fehlt.
   **Nicht** aus bloßer Wochenstundenzahl oder Rahmenzeit auf Pflicht schließen.
   Mit „Jetzt einstempeln“ aus Abschnitt D wird daraus **eingebucht**; das ist
   weder eine Standortmessung noch ein Nachweis physischer Anwesenheit.
2. Timer schließen, anschließend als HR im **operativen** Plan Kernzeiten
   entfernen: flexible Zeit/keine bekannte aktuelle Kernzeitpflicht, kein falsches
   „Fehlt“. Ein eindeutig passender Plan mit einem Fenster, das gerade nicht
   läuft, zeigt „außerhalb Kernzeit“. Nur Rahmenstart/-ende ändern begründet
   keine Anwesenheitspflicht.
3. Einen bekannten vertraglichen Nicht-Arbeitstag oder bestätigten Feiertag
   über eine ausdrücklich bekannte Test-Vertragsperiode herstellen. Ohne Timer
   ist dies entsprechend entschuldigt/nicht erforderlich. Mit offenem Timer
   bleiben **Buchungsfakt und Grund der fehlenden Pflicht** getrennt lesbar.
   Vertragsänderungen wie bei #45 datiert bestätigen; keine historische
   Korrektheit aus einem bloßen Profilwechsel ableiten.
4. Genehmigten vollen Urlaub/Sonderurlaub bzw. erfasste Krankheit für heute
   prüfen: keine Fehlbuchungswarnung. Pending/Draft/Rejected/Cancelled entschuldigt
   **nicht**. Homeoffice hebt eine bekannte Kernzeitpflicht nicht allein auf.
   Bei genehmigtem **halben** Tag zeigt die Oberfläche die zeitlich unbestimmte
   Teilabwesenheit, statt willkürlich morgens/nachmittags freizugeben. Zwei
   unbestimmte Halbtagssätze werden nicht zu erfundenen Zeitfenstern addiert.
5. Als HR im Testplan eine kurze Kernzeit eintragen: Beginn etwa zwei Minuten
   nach der aktuellen **Serverzeit**, Ende zwei Minuten später, heutiger
   Wochentag. Nach einmaligem Laden die Ansicht offen lassen: Start-/Endgrenzen
   müssen ohne Klick wirksam werden. Zusätzlich als Beschäftigte in einem
   zweiten Fenster starten/stoppen: Cockpit aktualisiert durch Ereignisse;
   ein 30-Sekunden-Fallback deckt ausgefallene Ereignisse ab. Bei Ladefehlern
   darf ein alter „Fehlt“-Stand nicht als aktueller gesicherter Fakt erscheinen.
6. Fehlender/mehrdeutiger Plan, fehlende Vertragsabdeckung oder eine mehrdeutige
   Kernzeit an der Zeitumstellung: klarer Unbekannt-Hinweis, keine erfundene Pflicht.
   Die automatisierten Fälle prüfen auch unbekannte Kalender und DST-Lücken/Folds.

Im Manager-Cockpit erscheinen nur **aktuelle direkte Teammitglieder**.
Hannah besitzt die ausdrücklich benannte Organisationssicht. Selbstaktionen
sind keine stellvertretenden Aktionen. Mitarbeiterrolle und Solo-Installation
haben keinen Team-Cockpit-Zugriff. Unnötige Krankheitsgründe, Bescheinigungen und
Diagnosen werden weder in der Tagesübersicht noch in der Historie ausgeliefert.

### C. Beide Genehmigungsarten unmittelbar im Cockpit

1. Abschnitt D erzeugt einen **gewöhnlichen geschlossenen** Eintrag außerhalb
   des Plans, z. B. gestern 06:15–08:45 bei Rahmen 07–18. Er erscheint in der
   Rahmenzeit-Genehmigungsliste. Marc genehmigt, danach Hannah bestätigt die
   HR-Stufe. Optionalen Kommentar und lesbare Historie kontrollieren.
2. Separat als Cockpit Test einen Antrag **bestehende Buchung korrigieren**
   auswählen, z. B. denselben Eintrag bis 09:45 verlängern. Im Cockpit erscheinen
   Mitarbeitername, originaler/veränderter Zeitraum, Zustand und Verlauf.
   Marc genehmigt, anschließend Hannah die weiterhin notwendige HR-Stufe.
   Buchungs-ID und Anzahl bleiben gleich; keine doppelte Materialisierung.
3. Einen anderen Eintrag bzw. Korrekturantrag ablehnen: Ablehnungsgrund ist
   erforderlich, Ergebnis und Verlauf sind für die betroffenen Rollen konsistent.
   Ein laufender Eintrag ist nicht als abgeschlossene Buchung genehmigbar.
4. Zwei Tabs mit demselben Stand: im ersten entscheiden, im zweiten dieselbe
   oder gegenteilige Entscheidung versuchen. Zweite Entscheidung scheitert als
   veraltet; neu laden. Auch **zurückgeben → bearbeiten → neu einreichen**
   legitimiert keine alte angezeigte Entscheidung (ABA). Genau ein Ergebnis,
   keine zusätzliche Buchung und kein doppeltes Audit.
5. Zwischen Laden und Entscheiden Managerzuordnung/Rolle ändern: alter Manager
   darf nicht mehr entscheiden. HR darf nicht die Managerstufe überspringen;
   eigene Einträge/Anträge können auch mit breiter Rolle nicht selbst genehmigt
   werden. Ein fehlender Manager bleibt sichtbar blockiert, nicht still bestätigt.

Alle Zeiten im Cockpit einschließlich Genehmigungsdetails folgen der angezeigten
Serverzeitzone. Ein Browser mit einer anderen Zone darf daraus keine anderen
Buchungszeitpunkte erzeugen. Normaler #42-Entwurfsdialog behält seine dokumentierte
Ortszeit-/ISO-Roundtrip-Logik mit Sekunden und expliziter Fold-Auswahl.

### D. Vollständige stellvertretende Erfassung

Als Marc „Cockpit Test“ wählen, Bereich **Im Auftrag erfassen**.
Jede Aktion benötigt eine **betriebliche Begründung (5–1000 Zeichen)**; keine
medizinischen Einzelheiten eingeben. Projekt/Service-Auftrag werden für die
begünstigte Person geladen, nicht aus Marcs eigenen Zuordnungen übernommen.

| Aktion                         | Konkreter Versuch                                                                                                 | Erwartung                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Jetzt einstempeln              | Betriebsgrund eintragen, optional zulässiges Projekt/Auftrag wählen, speichern                                    | Beginn ist Server-JETZT, genau ein offener Eintrag; Actor Marc und begünstigte Person getrennt im Audit                                 |
| Normal fortsetzen/stoppen      | Separates Fenster `cockpit.test@openclockwork.test`, Passwort `openclockwork`, normale Buchungsseite → Gehen      | Beschäftigte beendet ihre eigene stellvertretend gestartete Buchung ohne Sonderrecht; Rahmenprüfung bleibt aktiv                        |
| Abgeschlossene Zeit nachtragen | Freier vergangener Tag 06:15–08:45, Rahmen 07–18                                                                  | Geschlossene Pending-Buchung, Manager → HR erforderlich; kein automatisches Durchwinken durch die Stellvertretung                       |
| Pausenprüfung                  | Anderer freier Tag 08:00–16:30                                                                                    | Mit obigem Testplan 510 min brutto − 30 min Pause = **480 min netto**, keine manuelle Pausenüberschreibung                              |
| Zeitumstellung                 | Herbsttag mit zweifacher 02-Uhr-Stunde, sofern bereits vergangen                                                  | Explizite Auswahl mit Offset/ISO; keine still gewählte falsche Stunde. Nicht existierende Frühlings-Ortszeit wird abgewiesen            |
| Abwesenheit erfassen           | Krankheit, später separat Schulung und Freizeitausgleich auf freien Tagen                                         | Direkte betriebliche Aufzeichnung gemäß bestehender Domäne, kein erfundener Antragsstatus; Actor/Begünstigte/Zeitraum/Grund auditiert   |
| Abwesenheit beantragen         | Urlaub, Homeoffice und Sonderurlaub auf verschiedenen freien Tagen; ggf. halber erster/letzter Tag und Vertretung | Normale Validierung/Vertretungs-/Genehmigungskette, **nicht durch die Stellvertretung genehmigt**; Ersteller Marc im Submitted-Ereignis |

Für alle vier Modi dieselben Negativfälle prüfen:

- Zweimal „Jetzt einstempeln“ parallel, auch Manager gegen Beschäftigte:
  genau ein offener Timer; zweiter Versuch scheitert ohne zusätzliches Audit.
- Rückwirkende Überlappung, Ende vor Beginn, Zukunft und ungültiger Auftrag:
  keine Buchung. Manipulierte `breakRules`, `breakMinutes` oder `breakOverride`
  werden abgewiesen; normale gesetzliche/vertragliche Pausen bleiben wirksam.
- Fremde Team-ID, eigene ID, inaktive Person, gewechselte Zuordnung/Rolle oder
  Solo-Wechsel während der Operation: **403** bzw. ungültige Session **401**,
  keine Nebenwirkung. Ein HR-Recht ist kein Recht zur eigenen Stellvertretung
  oder zur eigenen Genehmigung.
- `employeeId`, `actorId`, Status oder Signaturen im Body können weder die
  URL-Zielperson noch den JWT-Akteur ersetzen. Nicht freigegebene Body-Felder
  sind nicht maßgeblich; ein ansonsten zulässiger Request kann trotzdem
  erfolgreich sein. **Fremdes URL-Ziel** bleibt unabhängig vom Body verboten.
- Proxy-Antrag mit zu wenig Urlaub, Überschneidung, falscher Vertretung oder
  nicht freigegebenem Typ: normaler Fachfehler, keine Auto-Genehmigung.
- Bei Krankheit keine Diagnose/Notiz/Bescheinigung einschleusen:
  medizinische Felder sind ausdrücklich verboten. Die Cockpit-Historie gibt
  auch vorhandene medizinische Notizen aus alten Abwesenheiten nicht zurück.

Auditkontrolle auf genau der isolierten Testdatenbank:

```bash
all5 exec -T db psql -v ON_ERROR_STOP=1 -U openclockwork -d openclockwork_test -c \
 'SELECT "action", "actorId", "employeeId", "resourceKind", "resourceId", "reason", "occurredAt"
  FROM "TeamProxyAudit" WHERE "employeeId" = '\''00000000-0000-4000-8000-000000004401'\''
  ORDER BY "occurredAt";'
```

Actor ist der tatsächliche angemeldete Erfasser, nicht die begünstigte Person.
Zeitbuchungs-Audits enthalten zusätzlich die Werte vorher/nachher; das Original
bleibt erhalten. Entscheidungen haben ihre eigenen tatsächlichen Akteure und
Zeitpunkte. Ein fehlgeschlagenes Schreiben rollt Werte, Entscheidung und Audit
zusammen zurück, statt einen halben Erfolg zu hinterlassen.

### E. Mitarbeiterhistorie und Kalender, vollständig statt nur Kurzliste

1. Cockpit Test wählen. **Monat, Quartal, Jahr und eigener Zeitraum** wechseln;
   Grenzen in der ausgewiesenen Serverzeitzone beachten. Zeitbuchungen,
   Krankheit/Schulung/Freizeitausgleich sowie Urlaub/Homeoffice/Sonderurlaub
   erscheinen mit Klasse, Zustand und ggf. Halbtag.
2. In den vorherigen Paketen erzeugte Pending/Draft/Rejected/Cancelled/Approved
   Datensätze prüfen. Kalender und Liste unterscheiden diese lesbar, nicht nur
   per Farbe. Ein offener Antrag ist **keine genehmigte Verfügbarkeit**.
   Datumsganze Abwesenheiten umfassen den letzten Tag; Halbtag bedeutet hier
   keine erfundene Vormittags-/Nachmittagslage.
3. Buchung über Mitternacht/Monatsgrenze: beide berührten Kalendertage korrekt,
   aber keine Phantombelegung am exklusiven Endzeitpunkt 00:00. Eine offene
   Buchung endet für die Kalenderdarstellung am geladenen Jetzt, nicht irgendwo
   in der Zukunft. Die Historie zeigt die vollständigen Originalintervalle;
   der separate #45-Vergleich berechnet geclippte Periodensummen.
4. **Verlauf** öffnen: Antragsereignisse/Entscheidungen, verknüpfte Korrektur mit
   Vorher/Nachher und Buchungs-Audit lesen. Stellvertretende Aktionen benennen
   den tatsächlichen Erfasser. Fremde aktuelle Zuordnung verhindert den Abruf;
   frühere Autorschaft ist kein dauerhaftes Leserecht.
5. Jahr laden: alle Cursor-Seiten werden nachgeladen; Fortschritt ist sichtbar,
   Kalender erst mit vollständigen Daten belastbar. Kein stilles 200-/500-Limit.
   Für mehr als ein Jahr bleibt die Historie bis fünf Jahre auswählbar; der
   separate Soll/Ist-Vergleich weist sein eigenes 366-Tage-Limit aus.
   Leere Bereiche, Ladefehler und erneutes Laden sind explizit bedienbar.

Optionaler **Großjahres-Fixture**: auf derselben Testperson ein älteres Jahr mit
mehr als 500 kleinen, nicht überlappenden geschlossenen Buchungen erzeugen.
Nicht als reale Historie/Vertragsbestätigung behandeln. Erzeugt mindestens
730 Buchungen (Schaltjahr 732), keine genehmigungspflichtigen Datensätze und
keinen erfundenen Vertrag. Bei wiederholtem Ausführen verhindert der Marker
Duplikate. Danach genau das Vorjahr im Jahresfilter wählen.

```bash
all5 exec -T db psql -v ON_ERROR_STOP=1 -U openclockwork -d openclockwork_test <<'SQL'
INSERT INTO "TimeEntry" (
  "id", "employeeId", "clockIn", "clockOut", "source", "status",
  "requiresApproval", "breakRules", "note", "updatedAt"
)
SELECT gen_random_uuid(), '00000000-0000-4000-8000-000000004401',
  ((d::date + slot) AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'UTC',
  ((d::date + slot + interval '15 minutes') AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'UTC',
  'Manual', 'Approved', false, '[]'::jsonb, 'MANUAL44 large-year fixture', CURRENT_TIMESTAMP
FROM generate_series(
  date_trunc('year', CURRENT_DATE)::date - interval '1 year',
  date_trunc('year', CURRENT_DATE)::date - interval '1 day', interval '1 day'
) d
CROSS JOIN (VALUES (TIME '12:00'), (TIME '13:00')) slots(slot)
WHERE NOT EXISTS (
  SELECT 1 FROM "TimeEntry" old
  WHERE old."employeeId" = '00000000-0000-4000-8000-000000004401'
    AND old."note" = 'MANUAL44 large-year fixture'
);
SQL
```

Unter DE und EN navigieren; Auswahllisten, Datumseingaben, Bestätigen/Ablehnen,
Fehler und Verlaufsdialog per Tastatur bedienen. Offline sind stellvertretende
Mutationen gesperrt. Fremde Team-IDs auch bei History/Cursor/Booking-Targets
prüfen; eine gemischte oder erratene ID erweitert niemals den Scope.

### F. Tatsächlich ausgeführte automatisierte Gates

Die ausführliche Anleitung A–E ist **kein behaupteter manueller Heimnachtest**.
Es wurde zusätzlich ein echter **automatisierter Chromium-Lauf** auf dem gebauten
isolierten Compose-Stack `openclockwork-all-five` durchgeführt. Browserzone
`America/New_York`, Serverzone `Europe/Berlin`: reale Logins, Manager-Proxy-Start,
normaler Employee-Stopp, Nachtrag und Bestandskorrektur jeweils Manager → HR,
stabile Ziel-ID/Anzahl, Krankheitsaufzeichnung, normaler halbtägiger Urlaubsantrag,
Historie/Kalender/Jahresfilter sowie fremde/eigene unzulässige Proxy-Ziele.
Keine Mock-API, keine realen Daten, keine gespeicherten Auth-Traces.

Der opt-in Test prüft vor Mutationen lokalen Docker-Kontext, exaktes Compose-
Projekt, synthetische Datenbank und Loopback-Port. Er ist nicht gegen ein
beliebiges Deployment ausführbar. Nach obigem einmaligem Setup, auf einem
Node-20-/pnpm-9-Entwicklerrechner mit installierten Abhängigkeiten und Chromium:

```bash
pnpm exec playwright install chromium
COCKPIT_RUNTIME_TEST=1 BASE_URL=http://127.0.0.1:18050 \
  pnpm nx run web-e2e:cockpit-runtime --skip-nx-cache
```

Der Test ergänzt eindeutig markierte synthetische Personen/Pläne, löscht keine
vorhandenen Daten und benötigt kein erneutes Seeden. Die endgültigen lokal ausgeführten Gates (Node **20.20.2**, pnpm **9.15.9**,
`TZ=Europe/Berlin`) sind:

| Gate                                                                                                         | Tatsächlich ausgeführtes Ergebnis                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm nx run api-e2e:e2e --runInBand --skip-nx-cache`                                                        | **653/653 Tests, 45 Suites bestanden**, einschließlich aller bisherigen #42/#41/#43/#45-Regressionen                                                                                                                                          |
| Neue #44-API-Fälle                                                                                           | **238**: 112 Scope/Anwesenheit/History/Approval-Listen/Targets, 30 stellvertretende Zeitbuchungen, 48 Abwesenheits-/Antragsfälle, 48 Versions-/Concurrency-/Autoritäts-/Audit-Fälle                                                           |
| `pnpm nx run api-e2e:e2e --runInBand --testPathPatterns=cockpit-decision-audit --skip-nx-cache`              | **48/48 bestanden**; unter anderem zwei gleichzeitige Entscheider, ABA-Rückgabe/Resubmit, Authority-Änderung nach Sperrwartezeit, aktuelle statt historische Audit-Rechte                                                                     |
| `pnpm nx run-many -t test -p web,shared --run --skip-nx-cache`                                               | Web **365/365 Tests in 49 Dateien**, Shared **88/88 in 7 Dateien** bestanden                                                                                                                                                                  |
| `pnpm nx run api-e2e:test-ops`                                                                               | **27/27 bestanden**                                                                                                                                                                                                                           |
| `pnpm nx run-many -t typecheck,lint -p api,web,shared,api-e2e,web-e2e`                                       | **Alle fünf Projekte erfolgreich**; nach Generierung Web/API-E2E/Web-E2E nochmals ohne Nx-Cache. **0 Lintfehler**, nur **15 bestehende Warnungen** (13 in den bisherigen vier Projekten + 2 im bestehenden Browser-Smoke), keine neue Warnung |
| `pnpm nx run-many -t build -p api,web,shared --skip-nx-cache`                                                | **Alle drei Produktions-Builds bestanden**, nach den Typechecks, ohne `dist`-Rennen                                                                                                                                                           |
| `pnpm verify:api`                                                                                            | OpenAPI und generierter Client reproduzierbar synchron; Ergebnis vor dem Commit geprüft                                                                                                                                                       |
| Befüllter echter DB-Upgrade vom akzeptierten #45-Stand                                                       | **27 → 28 Migrationen bestanden**, Sentinel-Werte/Audits erhalten, **0 erfundene Proxy-Audits**, weiterhin keine erfundene Vertragsbestätigung                                                                                                |
| Docker-Build/Start/Seed des kombinierten Branches                                                            | **API/Web gebaut, API/Web/DB healthy**, genau einmal synthetisch geseedet (9 Demo-Personen); finales Web-Image anschließend nachgebaut                                                                                                        |
| `COCKPIT_RUNTIME_TEST=1 BASE_URL=http://127.0.0.1:18050 pnpm nx run web-e2e:cockpit-runtime --skip-nx-cache` | **1/1 echter Chromium-Test bestanden**, finaler Lauf **9,4 s**, reale Manager-/HR-/Employee-Aktionen mit Browserzone New York gegen Serverzone Berlin                                                                                         |
| SQL-Blöcke aus #44 A und E                                                                                   | **Tatsächlich ausgeführt**: Plan, Kernzeit und synthetische Person angelegt; **730** geschlossene Vorjahresbuchungen eingefügt. Kein manueller Browsernachtest dieser SQL-Fixtures behauptet                                                  |
| `git diff --check`                                                                                           | Vor dem Commit bestanden                                                                                                                                                                                                                      |

Zwischenläufe fanden eine fehlende Feldfreigabe im Privacy-Test nach Ergänzung
des getrennten Pflichtgrunds, Typinferenz für leere Testarrays und eine neue
Test-Non-null-Warnung. Korrigiert wurden die expliziten Testtypen/-Guards und die
gezielte erlaubte Antwortfeldliste, nicht die Berechtigungs-/Privacy-Assertions.
Der erste tatsächliche Docker-Start zeigte außerdem `EACCES /app/package.json`
bei einem Quellcheckout mit `umask 077`: das Runtime-Image macht nur den
root-eigenen Code für den nicht privilegierten App-Benutzer lesbar; keine
Host-/Datenrechte wurden geändert. Der korrigierte Stack und der finale
Browserlauf waren erfolgreich.

Die bestehende CI bleibt unverändert und prüft auch den kumulativen Upgradepfad
von `main`. Exakten finalen Head, alle fünf CI-Ergebnisse und deren stabile
GitHub-URLs nennen PR/Issue-Kommentar; diese Aussagen dürfen nicht auf spätere
Commits übertragen werden. Menschlicher Gesamtnachtest zu Hause und unabhängige
Abnahme durch den Parent sind damit nicht vorweggenommen. Kein Merge, Release,
Tag, Versionsbump oder Deployment.

Lokal zum Ende `all5 stop`; Daten/Attachments bleiben für eine Fortsetzung
vorhanden. Keine Volumes löschen und nicht erneut seeden.
