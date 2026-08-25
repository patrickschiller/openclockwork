# iPad-Terminal einrichten und lokal testen

Diese Anleitung beschreibt die Einrichtung eines OpenClockwork-Terminals mit
einem fest montierten iPad. Das iPad zeigt ausschließlich den rotierenden
QR-Code. Mitarbeitende scannen ihn mit der angemeldeten OpenClockwork-PWA auf
ihrem eigenen Smartphone. Die Kamera wird dort immer benötigt; ein aktueller
GPS-Standort wird nur bei aktivierter Standortprüfung angefordert.

Das Terminal-Feature ist vollständig kostenlos. Der einmalige Hinweis auf eine
freiwillige Unterstützung von ungefähr 125 € schaltet keine Funktion frei
und verändert die Aktivierung nicht.

## Sicherheitsmodell in Kürze

- Nur ein `HRAdmin` darf Terminals anlegen, ändern, koppeln, neu koppeln,
  deaktivieren oder dauerhaft löschen.
- Ein neuer Kiosk wird über einen einmalig verwendbaren Pairing-Code bzw.
  Pairing-Link gekoppelt. Danach entfernt die Anwendung das Geheimnis aus der
  sichtbaren URL und speichert nur das widerrufbare Geräte-Credential lokal.
- Das Kiosk-Credential kann keine Arbeitszeiten buchen und keine Admin- oder
  Personaldaten lesen. Es darf ausschließlich den aktuellen Terminalzustand
  und die kurzlebige QR-Challenge abrufen.
- Die QR-Signatur wird täglich ausgetauscht; die sichtbare Challenge rotiert
  zusätzlich in kurzen Abständen. Kopien und Screenshots laufen daher ab.
- Die Buchung wird ausschließlich vom Server akzeptiert, wenn Challenge,
  Benutzeranmeldung und Replay-Schutz gültig sind. Ist die Standortprüfung am
  Terminal aktiviert, müssen zusätzlich Geofence und gemeldete GPS-Genauigkeit
  gültig sein.
- Kiosk, Pairing und Terminal-API werden nicht gecacht. Bei fehlender
  Netzwerkverbindung zeigt das Kiosk keinen weiterverwendbaren QR-Code.
- Beim dauerhaften Löschen verschwinden Terminal, Gerätezulassungen und
  QR-Challenges. Bereits gebuchte Arbeitszeiten bleiben mit ihren
  Standort-/Genauigkeits-Snapshots erhalten; ihre Terminalreferenzen werden
  gelöst.

Ein QR-Code allein beweist keinen Standort. Aktivieren Sie die serverseitige
Standortprüfung daher, wenn die Buchung auf den Montageort beschränkt sein soll.
Ein Terminal kann bewusst auch ohne GPS-Prüfung betrieben werden; dann fordert
die PWA beim Scannen keinen Standort an und speichert keine Standortdaten. Auch
bei aktivierter Prüfung kann GPS verfälscht werden; das Feature reduziert
Missbrauch, ersetzt aber keine organisatorischen Kontrollen.

## Voraussetzungen

Für einen vollständigen Test werden benötigt:

- ein Mac oder Linux-Rechner mit Docker Engine und Docker Compose;
- OpenSSL auf dem Docker-Rechner (unter macOS bereits vorhanden);
- ein iPad als Kiosk;
- ein zweites Smartphone mit Kamera als Mitarbeitergerät; GPS wird nur für den
  Betriebsmodus mit Standortprüfung benötigt;
- beide Geräte und der Docker-Rechner im selben vertrauenswürdigen WLAN;
- ein WLAN ohne Client-/AP-Isolation und ein freier TCP-Port `8443`;
- ein HRAdmin-Zugang und ein separater Mitarbeiterzugang.

Safari erlaubt Kamera und präzise Geolocation nur in einem sicheren Kontext.
Eine Warnseite für ein nicht vertrauenswürdiges Zertifikat genügt nicht: Das
Testgerät muss die lokale Zertifizierungsstelle ausdrücklich als
vertrauenswürdig kennen. Der mitgelieferte OpenSSL-Generator ist nur für ein
lokales Testnetz gedacht.
Für Produktion ist ein stabiler DNS-Name mit öffentlich oder unternehmensintern
verwaltetem TLS-Zertifikat erforderlich.

## 1. LAN-Adresse bestimmen

Ermitteln Sie die aktuelle IPv4-Adresse des Docker-Rechners. Unter macOS ist
dies häufig:

```bash
ipconfig getifaddr en0
```

Bei Ethernet, mehreren Adaptern oder einem VPN kann die Schnittstelle abweichen.
Die korrekte Adresse steht auch unter **Systemeinstellungen → Netzwerk**. In
dieser Anleitung wird beispielhaft `192.168.178.42` verwendet.

Die Adresse muss vom iPad erreichbar und während des Tests stabil sein. Für
wiederholte Tests empfiehlt sich eine DHCP-Reservierung im Router. Verwenden
Sie niemals eine öffentliche oder fremde IP-Adresse im lokalen Zertifikat.

## 2. Lokale TLS-Zertifikate erstellen

Der versionierte Generator erkennt nach Möglichkeit selbst eine private
LAN-IPv4-Adresse, validiert sie und legt CA sowie Serverzertifikat unter dem
ignorierten Verzeichnis `.certs/ipad/` ab:

```bash
./ops/generate-ipad-tls.sh
```

Falls die automatische Erkennung die falsche Schnittstelle auswählt oder keine
Adresse findet, geben Sie die ermittelte IP ausdrücklich an:

```bash
./ops/generate-ipad-tls.sh --ip 192.168.178.42
```

Bei Nutzung eines stabil auflösbaren `.local`-Namens kann dieser als zusätzlicher
DNS-SAN aufgenommen werden:

```bash
./ops/generate-ipad-tls.sh \
  --ip 192.168.178.42 \
  --hostname clockwork-mac.local
```

Die im Browser verwendete Adresse muss exakt im Zertifikat enthalten sein. Der
Generator akzeptiert für den LAN-Test nur private/link-lokale IPv4-Adressen,
setzt restriktive Dateirechte und ersetzt vorhandenes Servermaterial nicht
unbemerkt. Nach einem IP-Wechsel erzeugt `--force` ein neues Zertifikat und
archiviert das bisherige Paar lokal; die CA bleibt erhalten.

Die Dateien unter `.certs/` sind durch `.gitignore` ausgeschlossen. Geben Sie
insbesondere weder `openclockwork-ipad-key.pem` noch die dort erzeugte Datei
`rootCA-key.pem` weiter. Wer den Root-Schlüssel
besitzt, kann für Ihre lokale Zertifizierungsstelle beliebige Zertifikate
ausstellen.

## 3. Lokale CA auf den Testgeräten vertrauen

Übertragen Sie ausschließlich `.certs/ipad/rootCA.crt`, vorzugsweise per
AirDrop, auf das iPad und auf das Mitarbeitergerät. Übertragen Sie niemals
`.certs/ipad/rootCA-key.pem`.

Auf iPadOS/iOS:

1. Öffnen Sie die empfangene Datei und erlauben Sie das Laden des Profils.
2. Öffnen Sie **Einstellungen → Allgemein → VPN und Geräteverwaltung** und
   installieren Sie das Profil. Der Gerätecode wird dabei abgefragt.
3. Öffnen Sie **Einstellungen → Allgemein → Info → Zertifikatsvertrauenseinstellungen**.
4. Aktivieren Sie das vollständige Vertrauen für die lokale
   `OpenClockwork Local iPad Test CA`.
5. Entfernen Sie dieses Profil nach Ende des Tests wieder, wenn das Gerät nicht
   dauerhaft zum Testbestand gehört.

Bei verwalteten Geräten kann das Profil stattdessen über das MDM verteilt und
nach dem Pilot zentral zurückgezogen werden.

## 4. iPad-Testkonfiguration vorbereiten

Kopieren Sie die Vorlage:

```bash
cp .env.ipad.example .env.ipad
```

Passen Sie mindestens diese Werte in `.env.ipad` an:

```dotenv
IPAD_ORIGIN=https://192.168.178.42:8443
IPAD_HTTPS_PORT=8443
IPAD_TLS_CERT_FILE=./.certs/ipad/openclockwork-ipad.pem
IPAD_TLS_KEY_FILE=./.certs/ipad/openclockwork-ipad-key.pem
```

`IPAD_ORIGIN` ist die exakte Origin aus Schema, Host und Port – ohne Pfad und
ohne abschließenden Schrägstrich. Sie wird als LAN-Eintrag der engen
CORS-Allowlist der API verwendet; zusätzlich bleiben nur die beiden lokalen
Loopback-Web-Origins für Tests am Docker-Rechner erlaubt. Wenn Sie im Browser
einen Hostnamen statt der IP öffnen, muss hier derselbe Hostname stehen.

Ersetzen Sie `JWT_SECRET`, `TERMINAL_QR_SECRET`, `ERP_API_KEY`, `CRON_API_KEY`
und bei einem nicht vollständig privaten Testnetz auch das Datenbankpasswort
durch voneinander unabhängige Zufallswerte. Der QR-Schlüssel darf insbesondere
nicht mit `JWT_SECRET` identisch sein. Die Vorlage ist nicht für Produktion
bestimmt. Die Standardwerte lassen QR-Challenges 45 Sekunden und Pairing-Codes
10 Minuten gelten; zulässig sind 30–60 bzw. 60–1800 Sekunden.

Die direkten HTTP-, API- und PostgreSQL-Portfreigaben bleiben an
`127.0.0.1` gebunden. Nur der HTTPS-Gateway-Port wird im LAN geöffnet. Erlauben
Sie eingehend TCP `8443` in der Host-Firewall nur für das Testnetz bzw. die
Testgeräte.

## 5. Docker-Testumgebung starten

Starten Sie Dev-Stack und iPad-Overlay gemeinsam:

```bash
docker compose \
  -f docker-compose.dev.yml \
  -f docker-compose.ipad.yml \
  --env-file .env.ipad \
  up -d --build
```

Der API-Container führt Migrationen und den synthetischen Development-Seed
automatisch aus. Prüfen Sie anschließend:

```bash
docker compose \
  -f docker-compose.dev.yml \
  -f docker-compose.ipad.yml \
  --env-file .env.ipad \
  ps

curl --cacert .certs/ipad/rootCA.crt \
  https://192.168.178.42:8443/api/health
```

Alle vier Dienste (`db`, `api`, `web`, `ipad-gateway`) müssen laufen; der
Health-Endpunkt muss HTTP 200 liefern. Öffnen Sie danach auf beiden Testgeräten
`https://192.168.178.42:8443`. Safari darf keine Zertifikatswarnung anzeigen.

Der Seed-Zugang für HR lautet:

- Benutzer: `hannah.roth@openclockwork.test`
- Passwort: `openclockwork`

Mit `DEMO_MODE=true` ist dieser synthetische Zugang auf der Login-Seite bereits
vorausgefüllt. Der iPad-Test-Overlay setzt diese Option standardmäßig; in
Produktions-Deployments bleibt sie deaktiviert.

Verwenden Sie einen anderen Seed-Benutzer für den eigentlichen Scan. Testen Sie
den Kiosk und die Mitarbeiterbuchung nicht mit derselben Browser-Sitzung.

## 6. Terminal als HRAdmin anlegen

1. Melden Sie sich auf einem normalen Admin-Gerät als `HRAdmin` an.
2. Öffnen Sie **Administration → Einstellungen → Terminals** bzw.
   `/admin/settings/terminals`.
3. Legen Sie ein Terminal mit eindeutigem Namen, Logo, frei konfigurierbarem
   Text und sichtbarer Ortsbezeichnung an.
4. Entscheiden Sie unter **Standortprüfung**, ob beim Scan ein GPS-Standort
   verlangt werden soll. Deaktivieren Sie die Option, wenn das Terminal ohne
   Standortfreigabe funktionieren soll; Koordinaten und GPS-Grenzwerte sind dann
   nicht erforderlich.
5. Bei aktivierter Standortprüfung tragen Sie Breiten- und Längengrad des
   Montageorts ein oder verwenden am Montagepunkt über die HTTPS-Origin
   **Aktuellen Standort verwenden**. Koordinaten werden als Dezimalgrad
   gespeichert, beispielsweise `49.7913`, `9.9534`.
6. Legen Sie dann den zulässigen Radius und die maximal akzeptierte
   GPS-Ungenauigkeit fest. Für den Pilot ist ein Radius von 50–100 Metern
   praktikabel; für den späteren Betrieb muss der Wert am realen Montageort
   vermessen werden.
7. Wählen Sie die IANA-Zeitzone des Montageorts aus der Dropdown-Liste. Sie
   bestimmt den lokalen Tageswechsel für die täglich erneuerte QR-Signatur.
8. Aktivieren Sie das Terminal. Die Funktion ist zu diesem Zeitpunkt bereits
   vollständig aktiv. Der anschließend einmalig angebotene Unterstützungslink
   ist freiwillig und darf geschlossen oder übersprungen werden.
9. Wählen Sie **Gerät koppeln** und lassen Sie den einmaligen Pairing-Link bzw.
   Code geöffnet, bis das iPad gekoppelt ist. Veröffentlichen Sie ihn nicht in
   Tickets, Chats oder Screenshots.

Für einen schnellen Funktionstest liegt ein synthetisches PNG-Logo unter
`docs/assets/fiktives-terminal-logo.png`. Beim Hochladen wird das Logo als
kompakte Data-URL direkt am Terminal-Datensatz in PostgreSQL gespeichert; im
laufenden System entsteht dafür keine separate Datei im Web- oder API-Container.

Bei aktivierter Standortprüfung sollten Koordinaten nicht aus einer postalischen
Adresse geschätzt werden. Ermitteln Sie sie am vorgesehenen Montagepunkt mit
einem Gerät, dessen Standort bereits stabil und präzise ist, und kontrollieren
Sie sie auf einer Karte.

## 7. Home-Screen-Kiosk installieren und einmalig koppeln

Safari und eine installierte Home-Screen-Web-App können auf iPadOS getrennte
Browser-Speicher verwenden. Koppeln Sie deshalb direkt in dem Kontext, in dem
der Kiosk später läuft:

1. Öffnen Sie in Safari auf dem iPad zunächst die saubere URL
   `https://<LAN-IP>:8443/kiosk` – ohne Pairing-Parameter.
2. Wählen Sie **Teilen → Zum Home-Bildschirm**.
3. Schließen Sie Safari und starten Sie den Kiosk über das neue Home-Screen-Icon.
4. Geben Sie dort den im HR-Adminbereich angezeigten Einmalcode ein. So wird das
   Geräte-Credential im Speicher der installierten Kiosk-App abgelegt.
5. Nach erfolgreicher Kopplung darf weder die angezeigte URL noch ein später
   kopierter Link einen Pairing-Code enthalten.
6. Der Terminalname, das Logo, der Text, der Ort und ein aktuell rotierender
   QR-Code müssen erscheinen.
7. Kontrollieren Sie im HR-Adminbereich, dass das Gerät als gekoppelt bzw.
   zuletzt online angezeigt wird.

Der vollständige Pairing-Link bleibt als Fallback für einen kurzfristigen Test
direkt in Safari verfügbar. Installieren Sie den Kiosk danach, kann das dort
gespeicherte Credential jedoch fehlen; erzeugen Sie dann einen neuen Code und
koppeln Sie innerhalb der Home-Screen-App. Teilen oder speichern Sie den Link
nicht dauerhaft.

Ein Pairing-Code ist einmalig und kurzlebig. Bei Fehlversuchen oder einem
versehentlich geteilten Link erzeugen Sie einen neuen Code. Versuchen Sie nicht,
einen alten Link durch Zurück-Navigation wiederzuverwenden.

## 8. Pilot: Home-Screen und Geführter Zugriff

Für einen beaufsichtigten Pilot genügt der iPad-Kiosk mit Home-Screen-Icon und
Geführtem Zugriff:

1. Starten Sie den in Schritt 7 installierten und gekoppelten Kiosk über sein
   Home-Screen-Icon und prüfen Sie, ob der Terminalzustand geladen wird.
2. Aktivieren Sie unter **Einstellungen → Bedienungshilfen → Geführter Zugriff**
   den Geführten Zugriff und setzen Sie einen eigenen Code bzw. Face ID/Touch ID
   zum Beenden.
3. Öffnen Sie den Kiosk, drücken Sie dreimal die obere Taste bzw. Home-Taste und
   starten Sie den Geführten Zugriff. Deaktivieren Sie Berührung, wenn am Kiosk
   keine Interaktion vorgesehen ist.
4. Schließen Sie das iPad an eine dauerhafte, gegen Abziehen geschützte
   Stromversorgung an. Deaktivieren Sie automatische Sperre nur für das
   dedizierte Testgerät und reduzieren Sie die Helligkeit auf einen dauerhaft
   gut scanbaren Wert.

Der Geführte Zugriff ist keine zentrale Geräteverwaltung. Ein Pilotgerät muss
regelmäßig auf Onlinezustand, Bildschirmsperre, iPadOS-Dialoge und Stromversorgung
kontrolliert werden.

## 9. Kamera und Standort auf dem Mitarbeitergerät

1. Öffnen oder installieren Sie die OpenClockwork-PWA über exakt dieselbe
   HTTPS-Origin und melden Sie sich als Mitarbeiter an.
2. Starten Sie **Terminal scannen**. Erlauben Sie der Site/PWA die Kamera nur
   während der Nutzung.
3. Scannen Sie den QR-Code. Sobald er erkannt wurde, beendet die PWA die Kamera.
   Bei deaktivierter Standortprüfung wird die Buchung ohne GPS-Abfrage gesendet.
4. Bei aktivierter Standortprüfung fordert die PWA eine frische Messung an.
   Erlauben Sie Standortzugriff und aktivieren Sie **Genauer Standort**. Eine
   ungefähre Position muss vom Server abgewiesen werden, wenn ihre gemeldete
   Ungenauigkeit über dem Terminalgrenzwert liegt.
5. Warten Sie auf die ausdrückliche Buchungsbestätigung; ein erkannter QR-Code
   allein ist noch keine erfolgreiche Arbeitszeitbuchung.

Das Kiosk-iPad selbst benötigt weder Kamera- noch Standortfreigabe. Werden diese
dort angefordert, prüfen Sie, ob versehentlich die Mitarbeiter- statt der
Kioskroute geöffnet wurde.

## 10. Abnahmetest am Montageort

Führen Sie die folgende Matrix mit synthetischen Testkonten durch. Kontrollieren
Sie das Ergebnis sowohl in der Mitarbeiteransicht als auch im HR-Bericht.

| Test                   | Durchführung                                                                       | Erwartetes Ergebnis                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Korrektes Einstempeln  | Frischen QR innerhalb des Geofence mit präzisem GPS scannen                        | Genau ein offener Eintrag mit Quelle Terminal                                  |
| Doppeltes Einstempeln  | Direkt erneut scannen                                                              | Kein zweiter offener Eintrag; verständliche Fehlermeldung                      |
| Ausstempeln            | Später frischen QR innerhalb des Geofence scannen                                  | Offener Eintrag wird beendet                                                   |
| Außerhalb des Geofence | Physisch außerhalb testen oder Terminalkoordinate vorübergehend deutlich versetzen | Server lehnt ohne Zeitbuchung ab und zeigt Entfernungshinweis                  |
| Ungenauer Standort     | Genauen Standort deaktivieren oder in einem abschirmenden Bereich testen           | Ablehnung, wenn gemeldete Genauigkeit den Grenzwert überschreitet              |
| Terminal ohne GPS      | Standortprüfung deaktivieren, Standortfreigabe verweigern und frischen QR scannen  | Buchung gelingt; Zeitbuchung enthält keine GPS- oder Geofence-Nachweisdaten    |
| Abgelaufener QR        | Screenshot aufnehmen, sichtbare Rotation abwarten, alten Screenshot scannen        | Server lehnt als abgelaufen ab                                                 |
| Replay                 | Denselben bereits erfolgreichen QR erneut verwenden                                | Keine zusätzliche Buchung; Challenge wird nicht erneut akzeptiert              |
| Kiosk offline          | WLAN am Kiosk abschalten                                                           | QR wird ausgeblendet/als offline markiert; keine alte Challenge bleibt buchbar |
| Mitarbeiter offline    | Netzwerk am Smartphone abschalten und scannen                                      | Keine lokale Warteschlange und keine spätere automatische Buchung              |
| Neukopplung            | Neuen Pairing-Code erzeugen und auf einem Ersatzgerät erfolgreich koppeln          | Das bisherige Kiosk-Credential verliert den Zugriff                            |
| Terminal deaktiviert   | Terminal im HR-Adminbereich deaktivieren                                           | Gekoppelter Kiosk erhält keine Challenge mehr; Scans werden abgewiesen         |
| Rollenprüfung          | Als Employee/Manager die Adminroute aufrufen                                       | Kein Zugriff auf Terminalverwaltung oder Pairing                               |
| Neustart               | iPad-App und Gateway neu starten                                                   | Gekoppelter Kiosk kehrt ohne erneuten Pairing-Link zurück                      |

Setzen Sie eine zum Test verschobene Koordinate unmittelbar danach auf den
realen Montageort zurück. Ein Tageswechsel der Signatur sollte zusätzlich in
einem automatisierten API-Test abgedeckt sein; ein manueller Langzeittest kann
am Folgetag bestätigen, dass ein am Vortag gespeicherter QR nicht mehr gilt.

## 11. Produktion mit MDM

Für unbeaufsichtigte oder mehrere Terminals ist MDM statt Geführtem Zugriff
vorgesehen. Die konkreten Namen unterscheiden sich je nach Anbieter, die
Zielkonfiguration ist jedoch gleich:

- betreutes iPad mit eigenem Geräteprofil und dokumentiertem Eigentümer;
- verwaltetes WLAN, Zeitzone und automatische Zeitsynchronisierung;
- stabiler DNS-Name und ein öffentlich vertrauenswürdiges oder per MDM
  verteiltes Unternehmens-CA-Zertifikat;
- nicht entfernbarer Vollbild-Web-Clip auf `https://<host>/kiosk`;
- Single App Mode für den Web-Clip bzw. den freigegebenen Browser;
- deaktivierte Navigation, App-Installation, Accountänderungen und – soweit
  organisatorisch vorgesehen – Screenshots/AirDrop;
- kontrollierte Bildschirm-Einschaltzeit, Helligkeit und OS-Updatefenster;
- dauerhafte Stromversorgung, Diebstahlschutz und Ersatzgeräteprozess;
- nur ausgehende HTTPS-Verbindung zum OpenClockwork-Host, keine direkte
  Freigabe von PostgreSQL oder API-Ports ins Standortnetz;
- Monitoring auf Offlinezustand und einen dokumentierten Re-Pairing-Prozess.

Verteilen Sie niemals den Pairing-Link als statischen Web-Clip. Der Web-Clip
enthält ausschließlich die saubere `/kiosk`-URL; die Kopplung findet einmalig
auf dem konkreten Gerät statt.

## 12. Betrieb, Austausch und Sperren

- Prüfen Sie täglich, ob der QR-Code sichtbar rotiert und das Terminal online
  ist. Ein Standbild ist kein betriebsfähiger Zustand.
- Dokumentieren Sie Terminal-ID, Montageort, verantwortliche Person,
  Gerätenummer und Datum der Kopplung – niemals das Geräte-Credential.
- Prüfen Sie bei Terminals mit Standortprüfung Geofence und
  GPS-Genauigkeitsgrenze nach Umzug, Umbau, WLAN-Wechsel oder wiederholten
  Standortfehlern erneut.
- Deaktivieren Sie das Terminal eines verlorenen oder gestohlenen iPads sofort.
  Für einen geplanten Gerätetausch erzeugen Sie einen neuen Pairing-Code und
  schließen die Kopplung auf dem Ersatzgerät ab; dadurch wird das bisherige
  Geräte-Credential ungültig.
- Nach Deaktivierung bzw. erfolgreicher Neukopplung darf das alte Gerät auch mit
  lokal verbliebenem Zustand keine Challenge mehr erhalten.
- Behandeln Sie Terminalbuchungen und Standortprüfungen als personenbezogene
  Arbeitszeitdaten. Legen Sie Zweck, Zugriffsrechte, Aufbewahrung und Information
  der Beschäftigten mit Datenschutz und Arbeitnehmervertretung fest.
- Bei aktivierter Standortprüfung speichert OpenClockwork den geprüften
  Standort, die gemeldete Genauigkeit, den Messzeitpunkt, die berechnete
  Entfernung sowie die damals gültigen Geofence-Grenzwerte zusammen mit der
  Zeitbuchung. Bei deaktivierter Standortprüfung bleiben diese Felder leer.
  Nachweisdaten werden standardmäßig nicht automatisch anonymisiert oder vor
  der Zeitbuchung gelöscht. Legen Sie deshalb vor dem Produktivbetrieb eine
  dokumentierte Lösch- und Aufbewahrungsregel für Zeitbuchungen und ihre
  Standortdaten fest.

## 13. Fehlerdiagnose

### Safari meldet eine unsichere Verbindung

- Prüfen Sie, ob die geöffnete IP bzw. der Hostname im Zertifikat enthalten ist.
- Installieren Sie `rootCA.crt` und aktivieren Sie zusätzlich das vollständige
  Vertrauen in den Zertifikatsvertrauenseinstellungen.
- Nach einem Wechsel der LAN-IP muss ein neues Zertifikat erzeugt und
  `IPAD_ORIGIN` angepasst werden.
- Prüfen Sie Datum, Uhrzeit und Zeitzone auf allen Geräten.

### Das iPad erreicht den Host nicht

- Prüfen Sie dasselbe WLAN, Client-Isolation, VPN, macOS/Linux-Firewall und TCP
  `8443`.
- Testen Sie `https://<LAN-IP>:8443/api/health` zuerst in Safari.
- Kontrollieren Sie `docker compose ... ps` und die Logs mit:

  ```bash
  docker compose \
    -f docker-compose.dev.yml \
    -f docker-compose.ipad.yml \
    --env-file .env.ipad \
    logs --tail=200 ipad-gateway web api
  ```

### CORS-Fehler oder endloser Login

- `IPAD_ORIGIN` muss der Safari-Origin exakt entsprechen, einschließlich Port.
- Verwenden Sie keinen abschließenden Schrägstrich und keinen `/kiosk`-Pfad.
- Starten Sie den API-Container nach einer Änderung der Environment-Datei neu.

### Kamera erscheint nicht

- Kamera wird nur auf dem Mitarbeitergerät benötigt.
- Kontrollieren Sie unter den Safari-/App-Website-Einstellungen die
  Kameraberechtigung und laden Sie die PWA neu.
- Prüfen Sie, dass keine Zertifikatswarnung besteht und wirklich `https://`
  verwendet wird.
- MDM-Restriktionen dürfen die Kamera für die Mitarbeiter-PWA nicht sperren.

### Standort ist ungenau oder wird abgelehnt

- Aktivieren Sie Ortungsdienste und **Genauer Standort** für Safari/PWA.
- Testen Sie bei freierer Sicht und warten Sie auf eine stabile Messung.
- Vergrößern Sie den Radius nicht pauschal. Ermitteln Sie zuerst die realen
  Messwerte und passen Sie Radius sowie maximale Ungenauigkeit getrennt an.
- Eine vom Gerät gemeldete zu große Ungenauigkeit wird bewusst serverseitig
  abgewiesen.

### Kiosk zeigt einen alten oder keinen QR-Code

- Prüfen Sie Netzwerk, Serverzeit und API-Logs. Eine Offline-Challenge wird
  absichtlich nicht weiter angezeigt.
- Beenden Sie den Home-Screen-Kiosk und laden Sie `/kiosk` neu.
- Bleibt der Zustand inkonsistent, erzeugen Sie einen neuen Pairing-Code und
  koppeln Sie das Gerät neu; verwenden Sie keinen alten Pairing-Link.

## 14. Umgebung stoppen und Test-CA entfernen

Stoppen Sie den Stack ohne Datenverlust:

```bash
docker compose \
  -f docker-compose.dev.yml \
  -f docker-compose.ipad.yml \
  --env-file .env.ipad \
  down
```

Fügen Sie `-v` nur hinzu, wenn die lokale Testdatenbank ausdrücklich und
unwiederbringlich gelöscht werden soll. Entfernen Sie nach Abschluss des Pilots
das lokale OpenSSL-CA-Profil von privaten Testgeräten. Löschen oder archivieren
Sie lokale Zertifikate nach der eigenen Sicherheitsrichtlinie; committen Sie
sie niemals.
