# Nachtest der Issue-Pakete

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
Kein `down -v`: Das würde die Nachtestdaten löschen. Folgepakete #41, #43, #45
und #44 ergänzen diese Anleitung erst bei ihrer jeweiligen Implementierung.
