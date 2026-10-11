# QR/PIN-Terminal betreiben

OpenClockwork 2.1.0 enthält Inkrement A von Issue #33: Team-Terminals können
Personalnummer und einen separaten achtstelligen PIN verwenden. RFID ist nicht
Bestandteil dieses Releases. Bestehende QR-Terminals bleiben beim Upgrade
QR-only. Solo erlaubt keine Terminalfunktionen. Die Leseberechtigungen für
Personaldaten aus 2.0.1 bleiben erhalten.

Das Upgrade von 2.0.1 ergänzt die Migration
`20260930090000_terminal_pin_credentials`. Bestehende Daten und angewandte
Migrationen bleiben erhalten; kein Seed, Reset oder Umschreiben früherer
Migrationen ist erforderlich. Die PIN-Aktivierung erfolgt erst nach Einrichtung
der getrennten Datenbankrollen und des unten beschriebenen Audit-Betriebs.
Siehe [Upgrade-Anleitung](../UPGRADING.md).

## Einrichtung und täglicher Ablauf

1. Für alle API-Instanzen dieselben unabhängigen Secrets bereitstellen:
   `TERMINAL_PIN_PEPPER` und `TERMINAL_AUDIT_KEY`, jeweils mindestens 32 Zeichen.
   Sie dürfen weder untereinander noch mit JWT-/QR-Secrets identisch sein.
   Für Produktion zuvor Rollen, Archiv und Aufbewahrung gemäß den folgenden
   Abschnitten einrichten und prüfen.
2. Unter Administration → Einstellungen → Terminals QR und/oder PIN aktivieren.
   Ein aktives Terminal benötigt mindestens eine Methode. Das Gerät wie bisher
   per kurzlebigem Pairing-Code unter `/kiosk/pair` koppeln.
3. In der Mitarbeiterverwaltung einen Terminal-PIN erzeugen. HR sieht ihn
   einmalig und übergibt ihn persönlich. Das Webpasswort bleibt separat.
   Verlorene Ausgabe durch erneuten Reset ersetzen; der alte PIN wird ungültig.
4. Am Kiosk Personalnummer exakt einschließlich führender Nullen und PIN
   eingeben. Erst die anschließende ausdrückliche Ein-/Aus-Bestätigung bucht.
   Bei aktiviertem Geofence muss der Kiosk eine frische gültige Position liefern.

Nach fünf Fehlversuchen innerhalb 15 Minuten wird der PIN für 15 Minuten
gesperrt. QR/Weblogin bleiben verfügbar. HR kann entsperren oder den PIN
deaktivieren. Reset, Deaktivierung, Gerätewiderruf und Methodenänderung
invalidieren noch nicht eingelöste Freigaben. Fehlermeldungen verraten keine
Mitarbeiteridentität. Eine falsche PIN entfernt die Gerätekopplung nicht.

Kiosk-Daten liegen nur kurz im Speicher. Nach Erfolg, Abbruch, Hintergrundwechsel
oder Timeout werden PIN, Name und Freigabe gelöscht. Bei unklarer Netzwerkantwort
zeigt der Kiosk einen unbestätigten Zustand: nur dieselbe Aktion mit derselben
Freigabe wiederholen. Eine Wiederholung erzeugt keine zweite Buchung. Nach Abbruch
zuerst den Buchungsstand prüfen; die fehlende Antwort beweist keine Nichtbuchung.
Es gibt kein Offline-Stempeln.

## Datenbankrechte und Audit

Migrationen mit einer eigenen Owner-Rolle ausführen. Die API verwendet eine
getrennte Runtime-Rolle ohne Objektbesitz, Rollenmitgliedschaften oder
Superuser-Rechte. Das Rollenwerkzeug benötigt einen ausreichend privilegierten
Administrationszugang für `CREATE/ALTER ROLE` einschließlich der gesetzten
Rollenattribute; Tabellenbesitz oder `CREATEROLE` allein genügt dafür nicht in
jeder PostgreSQL-Umgebung. Dieser Zugang gehört ausschließlich in den
Migrations-/Administrationsjob, niemals in die API. Nach jeder Migration
die Tabellenrechte erneut einrichten. Das Runtime-Passwort muss mindestens
20 Zeichen enthalten. Die Werte als geschützte Umgebungsvariablen bereitstellen:

```sh
DATABASE_URL="${MIGRATION_DATABASE_URL:?Migrationszugang bereitstellen}" \
TERMINAL_RUNTIME_DB_PASSWORD="${TERMINAL_RUNTIME_DB_PASSWORD:?Runtime-Passwort bereitstellen}" \
node ops/configure-terminal-runtime.mjs
```

Das Werkzeug erzeugt standardmäßig `openclockwork_runtime`, gibt normale
Anwendungs-CRUD-Rechte und beschränkt `TerminalAuditEvent` auf SELECT/INSERT.
Die API-Verbindung muss danach den Runtime-Benutzer verwenden. Vor Produktions-
einführung die tatsächlichen Rechte einschließlich PUBLIC-Grants prüfen.
Die Produktions-API verweigert den Start mit aktiven PIN-Secrets, wenn die
Audit-Rechte oder Rollentrennung unsicher sind. Das optionale
`docker-compose.terminal-pin.yml` trennt Migrationsjob und API-Start; es setzt
`MIGRATION_DATABASE_URL`, Runtime-Passwort und unabhängige PIN-/Audit-Secrets
voraus. Mit der Produktions-Compose-Datei und passenden API-/Web-Images ab
Version 2.1.0 kombinieren; `OPENCLOCKWORK_VERSION=2.1.0` setzen. Das Overlay
ersetzt den Migrationsstart in der API durch den getrennten Job. `DATABASE_URL`
verwendet danach den Runtime-Benutzer mit demselben Passwort, das
`TERMINAL_RUNTIME_DB_PASSWORD` für die Rolleneinrichtung bereitstellt.
Azure-Referenzdeployments bleiben ohne entsprechende Secrets und Rollentrennung
QR-only; die neue Methode wird nicht automatisch produktiv aktiviert.
UPDATE/DELETE werden zusätzlich durch einen Trigger verweigert. Owner, Backup-
und Wartungszugriff müssen organisatorisch getrennt bleiben.

HR kann den gefilterten Verlauf in der Terminalverwaltung lesen. Ereignisse
enthalten Methode, Ergebnis, Serverzeit, bekannte Mitarbeiter-/Aktor-IDs und
Terminal-/Gerätebezug. Sie enthalten keine PINs, Personalnummern, JWTs oder Grants.
Historische Audit-Ereignisse bleiben beim Löschen eines Terminals erhalten.

Die Ereignisse bilden eine fortlaufende HMAC-SHA-256-Kette mit eigenem Key und
kanonischem Payload. Export und Prüfung benötigen alle historischen Audit-Keys:

```sh
node ops/terminal-audit.mjs export /secure-export/audit-2026-09-30.json
node ops/terminal-audit.mjs anchor /secure-export/audit-2026-09-30.json /independent-archive/anchor-2026-09-30.json
node ops/terminal-audit.mjs verify /secure-export/audit-2026-09-30.json /independent-archive/anchor-2026-09-30.json
```

`DATABASE_URL`, `TERMINAL_AUDIT_KEY`, `TERMINAL_AUDIT_KEY_VERSION` und optional
`TERMINAL_AUDIT_PREVIOUS_KEYS` über geschützte Umgebungsvariablen bereitstellen.
Exporte enthalten personenbezogene Verweise und benötigen Zugriffsschutz.
Dateien werden nie überschrieben. Die Prüfung erkennt geänderte Felder,
Kettenlücken, falsche Signaturen und Kürzungen gegenüber dem unabhängigen Anker.

Ein externer Anker muss außerhalb von App/DB unveränderlich aufbewahrt werden,
etwa in einem getrennt administrierten Retention-Archiv. Das lokale Dateiverfahren
ist ein Prüfadapter; Dateirechte allein bieten keine WORM-Garantie. Betreiber
legen Speicherziel, Key-Zugriff, regelmäßigen Export, Überwachung, Aufbewahrung
und Wiederherstellungsprüfung vor dem produktiven PIN-Einsatz fest. Die lokale
Nutzerabnahme und die Veröffentlichung von 2.1.0 ersetzen diese
installationsbezogene Konfiguration und Prüfung nicht. Ereignisse seit dem
letzten externen Anker sind ein verbleibendes Manipulationsfenster. Kein
automatischer Audit-Purge ist konfiguriert. Eine Löschung erfordert separate
Wartungsrechte und eine dokumentierte Archivgrenze.

## Schlüsselwechsel, Backup und Rückfall

PIN-Pepper versionieren über `TERMINAL_PIN_PEPPER_VERSION`. Bei Rotation den
alten Pepper zeitweise in `TERMINAL_PIN_PREVIOUS_PEPPERS` als JSON-Map halten;
alle API-Instanzen müssen dasselbe Keyset haben. PIN-Hashes lassen sich ohne
Klartext nicht offline auf einen neuen Pepper umrechnen: HR muss PINs neu vergeben,
bevor alte Keys entfernt werden. Ein verlorener Pepper erfordert Neuvergabe.
Fehlender Audit-Key oder Pepper verhindert PIN-Aktivierung; Legacy-QR bleibt
ohne neue Secrets nutzbar.

Audit-Key versionieren über `TERMINAL_AUDIT_KEY_VERSION`; alte Audit-Keys für
Verifikation in geschütztem Schlüsselarchiv behalten. `TERMINAL_AUDIT_PREVIOUS_KEYS`
wird nur vom Export-/Prüfwerkzeug gelesen. PIN-/Audit-Keys getrennt von DB-Backups
sichern und Wiederherstellung zusammen mit dem letzten unabhängigen Anker testen.
TLS und ein gehärteter Kiosk bleiben notwendig; ein gestohlenes Gerätetoken kann
ein Gerät imitieren. Browser-GPS ist kein fälschungssicherer Anwesenheitsnachweis.

Rückfall: in HR PIN deaktivieren, QR ausdrücklich aktivieren und Kiosk prüfen.
Schema und Audit bleiben erhalten. Keine destruktive Down-Migration und kein
ungeprüfter Rücksprung auf alte Binaries. Tablet/Safari/PWA, Sleep/Resume,
Netzverlust, GPS und schnelle Mitarbeiterwechsel müssen auf der Zielhardware
abgenommen werden; lokale Chromium-Tests ersetzen diese Betriebsabnahme nicht.
