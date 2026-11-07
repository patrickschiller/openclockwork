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
