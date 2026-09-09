import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { soloDe, soloEn } from './solo-i18n';

export type Locale = 'de' | 'en';
type Variables = Record<string, string | number>;
type Catalog = Record<string, string>;

const STORAGE_KEY = 'openclockwork.locale';

const de: Catalog = {
  ...soloDe,
  'projects.deleteFailed': 'Projekt konnte nicht gelöscht werden',
  'projects.deleteHint':
    'Löschen ist nur möglich, solange keine Zeiten gebucht sind',
  'projects.deleteOrderHint':
    'Löschen ist nur möglich, solange keine Zeiten auf den Auftrag gebucht sind',
  'projects.createFailed': 'Anlegen fehlgeschlagen',
  'common.deleteFailed': 'Löschen fehlgeschlagen',
  'projects.orderNo': 'Auftragsnr.',
  'projects.orderTitle': 'Titel',
  'projects.orderPlaceholder': 'z. B. Konzeption & Design',
  'projects.planHours': 'PLAN (h)',
  'projects.planHoursHint': 'PLAN-Zeit (Stunden, leer = kein Plan)',
  'projects.assignments': 'Zuweisungsmatrix',
  'projects.assignmentsHint':
    'Nur zugewiesene Mitarbeiter:innen können Zeiten auf ein Projekt buchen.',
  'booking.splitFailed': 'Aufteilen fehlgeschlagen',
  'booking.rangeFailed': 'Nachtrag fehlgeschlagen',
  'booking.inheritProject': '— wie erster Teil ({project}) —',
  'booking.inheritNoProject': '— wie erster Teil (ohne Projekt) —',
  'booking.splitInvalid':
    'Der Zeitpunkt muss strikt zwischen Kommen und Gehen liegen.',
  'booking.rangeAction': 'Nachtragen',
  'employees.passwordFailed': 'Setzen fehlgeschlagen',
  'employees.passwordSetting': 'Setze…',
  'employees.passwordSet': 'Setzen',
  'projects.noPlan': 'IST {hours} · kein PLAN definiert',
  'projects.planComparison': 'IST {actual} / PLAN {planned}',
  'projects.reportDescription':
    'Gebuchte Zeiten mit Tätigkeiten — zur Weitergabe an den Kunden als CSV exportierbar.',
  'projects.reportDate': 'Datum',
  'projects.reportOrder': 'Auftrag',
  'projects.reportTotal': 'Gesamt',
  'projects.reportEmpty': 'Keine Buchungen im gewählten Zeitraum.',
  'projects.downloadCsv': 'CSV herunterladen',
  'booking.summary': 'Brutto {gross} · Pause {break}min · Netto {net}',
  'booking.since': 'Seit {date}',
  'booking.failed': 'Buchung fehlgeschlagen',
  'booking.clockOutFailed': 'Ausstempeln fehlgeschlagen',
  'booking.splitDescription':
    '{from} – {to} wird am gewählten Zeitpunkt in zwei Buchungen geteilt, z. B. für einen Projektwechsel.',
  'booking.splitAt': 'Zeitpunkt',
  'booking.splitProject': 'Projekt für den zweiten Teil',
  'booking.splitKeepProject': 'Projekt beibehalten',
  'booking.splitOtherProject': 'Anderes Projekt wählen…',
  'booking.rangeDescription':
    'Bucht ein Zeitintervall nachträglich auf ein Projekt. Voraussetzung: Der Zeitraum ist bereits als Arbeitszeit erfasst.',
  'requests.submitFailed': 'Antrag fehlgeschlagen',
  'requests.firstHalfDay': 'Erster Tag halb',
  'requests.lastHalfDay': 'Letzter Tag halb',
  'requests.attachmentLabel': 'Beleg (optional, max 10 MB)',
  'requests.balanceHint':
    '{remaining} Tage verfügbar ({total} gesamt − {approved} genehmigt − {pending} eingereicht).',
  'requests.timeAdjustmentPolicy':
    'Genehmigungen richten sich nach deinem Arbeitszeitplan. Zeiten außerhalb des konfigurierten Rahmens benötigen eine zusätzliche Genehmigung vor der HR-Bestätigung.',
  'requests.invalidTimeRange': '"Bis" muss nach "Von" liegen.',
  'requests.invalidDateRange': '"Bis" darf nicht vor "Von" liegen.',
  'schedules.breakRules': 'Automatischer Pausenabzug',
  'schedules.breakRulesHint':
    'Leere Regeln bedeuten keinen automatischen Abzug. Ab der angegebenen Anwesenheitsdauer wird die größte zutreffende Gesamtpause abgezogen. Regeln passend zu Vertrag und örtlichen Vorgaben festlegen.',
  'schedules.noBreakRules': 'Kein automatischer Pausenabzug',
  'schedules.addBreakRule': 'Pausenregel hinzufügen',
  'schedules.breakAfter': 'Ab Anwesenheit (Minuten)',
  'schedules.breakMinutes': 'Gesamtabzug (Minuten)',
  'schedules.breakRuleSummary': 'ab {after} min: {deduction} min',
  'schedules.frame': 'Rahmen',
  'schedules.frameStart': 'Rahmen Start',
  'schedules.frameEnd': 'Rahmen Ende',
  'schedules.workingDays': 'Arbeitstage',
  'schedules.workingDaysHint':
    'Nur die ausgewählten Tage zählen für Soll-Stunden und Urlaubsabrechnung. Die Auswahl muss zum Arbeitsvertrag passen.',
  'schedules.defaultHint':
    'Als Standardplan verwenden, wenn kein eigener Plan zugewiesen ist',
  'schedules.assignedResult': '{assigned} zugewiesen, {skipped} übersprungen',
  'schedules.assigning': 'Weise zu…',
  'schedules.bulkAssign': 'Bulk zuweisen',
  'schedules.deleteHint':
    'Zuerst alle Mitarbeiter:innen einem anderen Plan zuweisen',
  'schedules.coreLabel': 'Bezeichnung',
  'schedules.corePlaceholder': 'z. B. Vormittag',
  'schedules.start': 'Start',
  'schedules.end': 'Ende',
  'requests.auditHistory': 'Audit-Verlauf',
  'approvals.reviseDefault': 'Bitte überarbeiten',
  'employees.holidayCalendar': 'Feiertagskalender',
  'employees.holidayCalendarNone': 'Kein vorkonfigurierter Kalender',
  'employees.holidayCalendarGermany': 'Deutschland · {region}',
  'employees.holidayDates': 'Zusätzliche Feiertage',
  'employees.holidayDatesHint':
    'Für jedes Land: Feiertage als YYYY-MM-DD eingeben, getrennt durch Komma oder Zeilenumbruch. Diese ergänzen den gewählten Kalender. Ohne Kalender und Datumsangaben werden keine Feiertage abgezogen.',
  'employees.holidaySummary': '{calendar} · {count} zusätzliche Tage',
  'employees.holidayDatesInvalid':
    'Bitte gültige Datumsangaben im Format YYYY-MM-DD verwenden.',
  'employees.personalNo': 'Personal-Nr',
  'employees.timeModel': 'Zeitmodell',
  'employees.weeklyHours': 'Wochenstunden',
  'employees.annualLeaveDays': 'Jahresurlaub (Tage)',
  'employees.startDate': 'Eintrittsdatum',
  'employees.overtimeBalance': 'Übertrag Überstunden (Minuten, ± erlaubt)',
  'employees.overtimeBalanceShort': 'Übertrag',
  'employees.overtimeBalanceHint': '{minutes} min Übertrag',
  'employees.workSchedule': 'Arbeitszeitplan',
  'employees.firstName': 'Vorname',
  'employees.lastName': 'Nachname',
  'employees.initialPassword': 'Initial-Passwort (≥ 8 Zeichen)',
  'employees.activeHint':
    'Aktiv (deaktivierte Mitarbeiter:innen können sich nicht einloggen)',
  'employees.passwordFor': 'Für {name} ({email})',
  'language.de': 'Deutsch',
  'language.en': 'Englisch',
  'language.change': 'Sprache ändern',
  'common.loading': 'Lädt …',
  'common.save': 'Speichern',
  'common.saving': 'Speichere…',
  'common.cancel': 'Abbrechen',
  'common.close': 'Schließen',
  'common.delete': 'Löschen',
  'common.edit': 'Bearbeiten',
  'common.add': 'Hinzufügen',
  'common.remove': 'Entfernen',
  'common.approve': 'Genehmigen',
  'common.reject': 'Ablehnen',
  'common.optional': 'optional',
  'common.none': '— keine —',
  'common.all': '— alle —',
  'common.from': 'Von',
  'common.to': 'Bis',
  'common.type': 'Typ',
  'common.note': 'Notiz',
  'common.reason': 'Begründung',
  'common.employee': 'Mitarbeiter:in',
  'common.project': 'Projekt',
  'common.activity': 'Tätigkeit',
  'common.days': 'Tage',
  'common.hours': 'Stunden',
  'common.status': 'Status',
  'common.actions': 'Aktionen',
  'common.name': 'Name',
  'common.description': 'Beschreibung',
  'common.email': 'E-Mail',
  'common.role': 'Rolle',
  'common.manager': 'Manager',
  'common.select': '— wählen —',
  'common.default': '— Default —',
  'common.active': 'Aktiv',
  'common.inactive': 'Inaktiv',
  'common.activate': 'Aktivieren',
  'common.reactivate': 'Reaktivieren',
  'common.deactivate': 'Deaktivieren',
  'common.create': 'Neu anlegen',
  'common.yes': 'Ja',
  'common.no': 'Nein',
  'common.minutes': 'Minuten',
  'common.calendarDays': 'Kalendertage',
  'common.saveFailed': 'Speichern fehlgeschlagen',
  'common.hrOnly': 'Diese Seite ist HR-Admins vorbehalten.',
  'nav.dashboard': 'Dashboard',
  'nav.booking': 'Buchen',
  'nav.terminalScan': 'Terminal',
  'nav.calendar': 'Kalender',
  'nav.requests': 'Anträge',
  'nav.substitute': 'Vertretungen',
  'nav.absences': 'Abwesenheiten',
  'nav.approvals': 'Genehmigungen',
  'nav.projects': 'Projekte',
  'nav.workingTimes': 'Arbeitszeiten',
  'nav.schedules': 'Arbeitszeitpläne',
  'nav.employees': 'Mitarbeiter',
  'nav.terminals': 'Terminals',
  'shell.profile': 'Profil',
  'shell.accountMenu': 'Kontomenü öffnen',
  'shell.signedInAs': 'Angemeldet als',
  'shell.signOut': 'Abmelden',
  'shell.mainNavigation': 'Hauptnavigation',
  'shell.mobileNavigation': 'Mobile Navigation',
  'shell.more': 'Mehr',
  'shell.moreAreas': 'Weitere Bereiche',
  'shell.openMore': 'Weitere Bereiche öffnen',
  'shell.closeMore': 'Weitere Bereiche schließen',
  'shell.closeMenu': 'Menü schließen',
  'shell.install': 'Installieren',
  'shell.installHint':
    'OpenClockwork als App installieren — schneller Zugriff und Offline-Hinweis.',
  'shell.closeInstall': 'Installations-Hinweis schließen',
  'shell.adminFooter': 'Crafted with ❤️ in Würzburg by Patrick Schiller',
  'shell.adminVersion': 'OpenClockwork-Version {version}',
  'login.description': 'Anmeldung mit E-Mail und Passwort',
  'login.password': 'Passwort',
  'login.submit': 'Anmelden',
  'login.submitting': 'Anmelden…',
  'login.failed': 'Anmeldung fehlgeschlagen',
  'login.invalidCredentials': 'E-Mail-Adresse oder Passwort ist falsch.',
  'login.connectionFailed':
    'Der Server ist nicht erreichbar. Prüfe deine Verbindung und versuche es erneut.',
  'login.serverUnavailable':
    'Die Anmeldung ist wegen eines Serverproblems derzeit nicht möglich. Versuche es später erneut oder wende dich an die Administration.',
  'login.demoCredentials': 'Demo-Zugang',
  'demo.title': 'Öffentliche Demo-Umgebung',
  'demo.description':
    'Bitte keine echten personenbezogenen Daten eingeben. Alle eingegebenen Daten und Anhänge werden jede Nacht zurückgesetzt.',
  'theme.Light': 'Hell',
  'theme.Dark': 'Dunkel',
  'theme.System': 'Systemeinstellung',
  'theme.title': 'Design: {label} (klicken zum Wechseln)',
  'theme.aria': 'Design wechseln. Aktuell: {label}',
  'app.notFound': 'Nicht gefunden',
  'app.notFoundHint': 'Diese Seite existiert nicht.',
  'dashboard.welcome': 'Willkommen, {name}.',
  'dashboard.remainingLeave': 'Resturlaub',
  'dashboard.overtime': 'Überstundenkonto',
  'dashboard.violationsYtd': 'Kernzeitverletzungen YTD',
  'dashboard.noViolations': 'Keine Verstöße erkannt',
  'dashboard.violationsDetected': 'Kernzeitverletzungen erkannt',
  'dashboard.currentBooking': 'Aktuelle Buchung',
  'dashboard.openRequests': 'Offene Anträge',
  'dashboard.noOpenRequests': 'Keine offenen Anträge.',
  'dashboard.allRequests': 'Alle Anträge',
  'dashboard.notClockedIn': 'Du bist aktuell nicht eingestempelt.',
  'dashboard.clockInOut': 'Kommen / Gehen',
  'dashboard.bookingPage': 'Zur Buchungsseite',
  'dashboard.vacation': 'Urlaub {year}',
  'dashboard.createRequest': 'Antrag stellen',
  'dashboard.violationLate': '{count} verspätet',
  'dashboard.violationEarly': '{count} zu früh',
  'dashboard.violationMid': '{count} Pause in Kernzeit',
  'dashboard.violationDetails':
    '{count} Verstoß / Verstöße im laufenden Jahr — Details auf der Buchungs-Seite.',
  'dashboard.carryOver': 'Übertrag',
  'dashboard.approved': 'Genehmigt',
  'dashboard.carryOverExpires': 'Übertrag verfällt bald',
  'dashboard.carryOverExpiresDescription':
    '{days} Tage Resturlaub aus dem Vorjahr müssen bis zum {date} genommen werden.',
  'dashboard.plannedVacations': 'Geplante Urlaube',
  'dashboard.noPlannedVacations':
    'Aktuell keine bevorstehenden oder eingereichten Urlaube.',
  'dashboard.daysValue': '{count} Tage',
  'dashboard.leaveHint':
    '{approved} genehmigt · {pending} offen · {total} gesamt',
  'dashboard.clockedInSince': 'Eingestempelt seit {date}.',
  'dashboard.planned': '{used} von {total} Tagen verplant',
  'dashboard.remaining': '{count} verbleibend',
  'dashboard.remainingLabel': 'Verbleibend',
  'dashboard.leaveUsage': 'Urlaubsverbrauch: {used} von {total} Tagen',
  'dashboard.daysApproved': '{count} Tage genehmigt',
  'dashboard.daysPending': '{count} Tage offen',
  'dashboard.entitlement': 'Anspruch',
  'dashboard.baseEntitlement': 'Grundanspruch',
  'dashboard.adjustment': 'Korrektur',
  'dashboard.total': 'Gesamt',
  'dashboard.usage': 'Nutzung',
  'dashboard.pending': 'Offen',
  'dashboard.workDays': '{count} Arbeitstage',
  'booking.title': 'Buchung',
  'booking.description':
    'Kommen / Gehen mit optionalem GPS und optionaler Projektbuchung.',
  'booking.clockIn': 'Kommen',
  'booking.clockOut': 'Gehen',
  'booking.clockedIn': 'Eingestempelt',
  'booking.notClockedIn': 'Nicht eingestempelt',
  'booking.lastEntries': 'Letzte Buchungen',
  'booking.noEntries': 'Noch keine Buchungen.',
  'booking.approval': 'Genehmigung',
  'booking.violations': 'Kernzeitverstöße im laufenden Jahr ({count})',
  'booking.noViolations': 'Keine Kernzeitverstöße erkannt.',
  'booking.violation': 'Verstoß',
  'booking.offlineDescription':
    'Keine Verbindung zum Server. Buchungen sind aktuell deaktiviert — sobald wieder online, ist die Schaltfläche freigegeben.',
  'booking.offHours': 'Außerhalb der Regelzeit',
  'booking.offHoursDescription':
    'Buchungen außerhalb des konfigurierten Arbeitszeitrahmens sind genehmigungspflichtig.',
  'booking.startHint': 'Drücke „Kommen“, um eine neue Session zu starten.',
  'booking.sendLocation': 'Standort beim Stempeln mitsenden (optional)',
  'booking.orderRequired':
    'Dieses Projekt erfordert die Auswahl eines Service-Auftrags.',
  'booking.violationDescription':
    'Jedes nicht vollständig abgedeckte Kernzeitfenster zählt als eigener Verstoß. Der aktuelle Tag wird erst rückwirkend geprüft.',
  'booking.coreTime': 'Kernzeit',
  'booking.minutesUncovered': '{count} Minuten nicht abgedeckt',
  'booking.edit': 'Buchung bearbeiten',
  'booking.split': 'Buchung aufteilen',
  'booking.splitAction': 'Aufteilen',
  'booking.splitPending': 'Teile…',
  'booking.bookProjectTime': 'Projektzeit nachtragen',
  'booking.open': 'offen',
  'booking.noProject': '— ohne Projekt —',
  'booking.chooseProject': '— Projekt wählen —',
  'booking.chooseOrder': '— Auftrag wählen —',
  'booking.serviceOrder': 'Service-Auftrag',
  'booking.serviceOrderRequired': 'Service-Auftrag (Pflicht)',
  'booking.activityForReport': 'Tätigkeit (für die Kundenauswertung)',
  'booking.activityPlaceholder': 'z. B. Konzept für Startseite erstellt',
  'booking.dailyBlockHint':
    'Alternativ kannst du dein Tages-Soll von {net} als abgeschlossenen Block buchen.',
  'booking.dailyBlockAction': 'Tagesblock buchen',
  'booking.dailyBlockSource': 'Tagesblock',
  'booking.dailyBlockTitle': 'Arbeitszeit als Tagesblock buchen',
  'booking.dailyBlockDescription':
    'Der feste Tagesumfang wird direkt genehmigt gebucht. Nutze bei Abweichungen stattdessen Kommen und Gehen.',
  'booking.dailyBlockDate': 'Arbeitstag',
  'booking.dailyBlockStart': 'Beginn',
  'booking.dailyBlockPreview': '{start}–{end}',
  'booking.dailyBlockCalculation':
    '{gross} Anwesenheit − {break} Pause = {net} Arbeitszeit',
  'booking.dailyBlockSubmit': 'Block verbindlich buchen',
  'booking.dailyBlockSaving': 'Buche…',
  'booking.dailyBlockFailed': 'Tagesblock konnte nicht gebucht werden.',
  'booking.dailyBlockErrorInvalidDateTime':
    'Datum oder Startzeit sind ungültig.',
  'booking.dailyBlockErrorDisabled':
    'Die Tagesblockbuchung ist für dich nicht freigeschaltet.',
  'booking.dailyBlockErrorFutureDate':
    'Tagesblöcke können nicht im Voraus gebucht werden.',
  'booking.dailyBlockErrorBeforeEmployment':
    'Das Datum liegt vor deinem Beschäftigungsbeginn.',
  'booking.dailyBlockErrorNoDailyTarget':
    'Für dich ist kein gültiges tägliches Arbeitszeit-Soll hinterlegt.',
  'booking.dailyBlockErrorNonWorkingDay':
    'Der ausgewählte Tag ist laut Arbeitszeitplan kein Arbeitstag.',
  'booking.dailyBlockErrorPublicHoliday':
    'Der ausgewählte Tag ist ein gesetzlicher Feiertag.',
  'booking.dailyBlockErrorOutsideFrame':
    'Der Tagesblock muss vollständig innerhalb der hinterlegten Rahmenzeit liegen.',
  'booking.dailyBlockErrorTimeEntryConflict':
    'Für den ausgewählten Tag ist bereits eine Zeitbuchung vorhanden. Bitte wähle einen freien Arbeitstag.',
  'booking.dailyBlockErrorAbsenceConflict':
    'Für den ausgewählten Tag ist bereits eine Abwesenheit oder ein aktiver Antrag vorhanden.',
  'booking.dailyBlockErrorAlreadyExists':
    'Für den ausgewählten Tag wurde bereits ein Tagesblock gebucht.',
  'requests.title': 'Anträge',
  'requests.description': 'Urlaub, Home-Office, Sonderurlaub, Zeitkorrekturen',
  'requests.new': 'Neuer Antrag',
  'requests.own': 'Eigene Anträge',
  'requests.none': 'Noch keine Anträge.',
  'requests.specialApproval': 'Sondergenehmigung',
  'requests.submit': 'Antrag stellen',
  'requests.chooseTypeRange': 'Wähle Typ und Zeitraum',
  'requests.reasonOptional': 'Begründung (optional)',
  'requests.substituteOptional': 'Vertretung (optional)',
  'calendar.title': 'Kalender {year}',
  'calendar.description':
    'Genehmigte und offene Anträge plus Abwesenheiten im Jahresüberblick',
  'calendar.previousYear': 'Vorheriges Jahr',
  'calendar.nextYear': 'Nächstes Jahr',
  'substitute.title': 'Vertretungs-Inbox',
  'substitute.description': 'Anträge, in denen Du als Vertretung benannt bist',
  'substitute.open': 'Offen ({count})',
  'substitute.none': 'Aktuell keine Vertretungs-Anfragen.',
  'substitute.accept': 'Annehmen',
  'substitute.noteRequired': 'Notiz (Pflicht bei Ablehnung)',
  'absences.title': 'Abwesenheiten',
  'absences.entries': '{count} Einträge',
  'absences.none': 'Keine Einträge.',
  'absences.description':
    'Krankheit, Schulungen und Gleittage werden ohne Genehmigung als Tatsache eingetragen. Manager:innen und HR können Einträge für betreute Mitarbeiter:innen anlegen.',
  'absences.employeeHint':
    'Wähle eine Person — leer lassen heißt: alle Mitarbeiter:innen.',
  'absences.create': 'Abwesenheit eintragen',
  'absences.certificate': 'ärztliches Attest liegt vor',
  'absences.deleteConfirm': 'Eintrag wirklich löschen?',
  'absences.certificateShort': 'Attest',
  'absences.show': 'Anzeigen',
  'absences.employeeFilter': 'Abwesenheiten nach Mitarbeiter:in filtern',
  'absences.noNote': 'keine Notiz',
  'absences.certificateProvided': 'Attest vorgelegt',
  'absences.withoutCertificate': 'ohne Attest',
  'absences.editorDescription': 'Typ, Zeitraum und optionale Notiz',
  'absences.noteOptional': 'Notiz (optional)',
  'absences.flextimeNotice':
    'Hinweis: Gleittage reduzieren das Überstundenkonto aktuell nicht automatisch. Die rechnerische Verrechnung kommt in einer späteren Iteration; Kalender und Liste zeigen den Eintrag bereits korrekt.',
  'approvals.title': 'Genehmigungen',
  'approvals.restricted':
    'Diese Seite ist Manager:innen und HR-Admins vorbehalten.',
  'approvals.hrInbox': 'HR-Inbox: alle Anträge im Status „Wartet auf HR“',
  'approvals.managerInbox':
    'Manager-Inbox: Anträge, in denen Du als Nächstes genehmigst',
  'approvals.inbox': 'Posteingang ({count})',
  'approvals.selectAll': 'Alle auswählen',
  'approvals.clearSelection': 'Auswahl aufheben',
  'approvals.noOpen': 'Keine offenen Anträge.',
  'approvals.lastActivity': 'Letzte Aktivität',
  'approvals.selected': '{count} Antrag/Anträge ausgewählt',
  'approvals.approveRequests': 'Anträge genehmigen',
  'approvals.rejectRequests': 'Anträge ablehnen',
  'approvals.approveDescription':
    'Manager-Inbox-Einträge werden direkt genehmigt; HR-Inbox-Einträge werden HR-bestätigt. Zeitkorrekturen außerhalb der Regelzeit gehen automatisch in die HR-Stufe.',
  'approvals.rejectDescription':
    'Notiz ist Pflicht und wird auf jeden Antrag geschrieben.',
  'approvals.hrRequired':
    'HR-Bestätigung erforderlich (für alle Manager-Inbox-Einträge)',
  'approvals.selectRequest': 'Antrag auswählen',
  'approvals.outsideFrame':
    'Außerhalb der Rahmenarbeitszeit — Genehmigung läuft automatisch in zwei Stufen (Vorgesetzte:r, dann HR).',
  'approvals.hrConfirm': 'HR-bestätigen',
  'approvals.return': 'Zur Korrektur',
  'approvals.history': 'Verlauf',
  'projects.title': 'Projekte',
  'projects.description':
    'Projekte mit Service-Aufträgen strukturieren, PLAN-Zeiten pflegen und Mitarbeiter:innen für die Projektbuchung freischalten.',
  'projects.new': 'Neues Projekt',
  'projects.none': 'Noch keine Projekte angelegt.',
  'projects.report': 'Auswertung',
  'projects.overbooked': 'Überbucht',
  'projects.serviceOrders': 'Service-Aufträge',
  'projects.noServiceOrders': 'Keine Service-Aufträge.',
  'projects.edit': 'Projekt bearbeiten',
  'projects.editorDescription':
    'Der Projekt-Code ist eindeutig und erscheint im ERP-Export. Die PLAN-Zeit deckelt die Summe der Auftrags-PLAN-Zeiten.',
  'projects.activeHint': 'Aktiv (buchbar für zugewiesene Mitarbeiter:innen)',
  'reports.title': 'Arbeitszeiten',
  'reports.description':
    'Projektunabhängige Übersicht der erfassten Arbeitszeiten.',
  'reports.filters': 'Filter',
  'reports.rangeHint': 'Der Zeitraum darf höchstens 366 Tage umfassen.',
  'reports.date': 'Datum',
  'reports.start': 'Beginn',
  'reports.clockInLocation': 'Stempelort Beginn',
  'reports.end': 'Ende',
  'reports.clockOutLocation': 'Stempelort Ende',
  'reports.includeLocations': 'Stempelorte einbeziehen',
  'reports.gross': 'Brutto',
  'reports.break': 'Pause',
  'reports.net': 'Netto',
  'reports.total': 'Gesamt',
  'reports.result': 'Auswertung',
  'reports.projectIndependent':
    'Abgeschlossene, nicht abgelehnte Buchungen – unabhängig von Projekten.',
  'reports.downloadCsv': 'CSV herunterladen',
  'reports.empty': 'Keine Buchungen im gewählten Zeitraum.',
  'reports.invalidRange': 'Das Von-Datum muss vor oder am Bis-Datum liegen.',
  'reports.loadFailed': 'Arbeitszeiten konnten nicht geladen werden',
  'reports.adminOnly': 'Diese Seite ist HR-Admins vorbehalten.',
  'schedules.title': 'Arbeitszeitpläne',
  'schedules.description':
    'Rahmenarbeitszeit und Kernzeiten pro Plan, Zuweisung an Mitarbeiter:innen oder ganze Zeitmodelle.',
  'schedules.new': 'Neuer Plan',
  'schedules.none': 'Noch keine Arbeitszeitpläne angelegt.',
  'schedules.employees': '{count} Mitarbeiter:innen',
  'schedules.assign': 'Zuweisen',
  'schedules.timeModel': 'Zeitmodell',
  'schedules.assignEmployee': 'Einzelnen Mitarbeiter zuweisen',
  'schedules.override': 'Bestehende Zuweisungen überschreiben',
  'schedules.coreTimes': 'Kernzeiten',
  'schedules.noCoreTime': 'keine Kernzeit',
  'schedules.addCoreTime': 'Kernzeit hinzufügen',
  'schedules.noCoreTimes':
    'Keine Kernzeiten — passt für Vertrauensarbeitszeit.',
  'schedules.edit': 'Plan bearbeiten',
  'schedules.editorDescription':
    'Rahmen und beliebig viele Kernzeiten pro Wochentag',
  'employees.title': 'Mitarbeiter',
  'employees.description':
    'Stammdaten, Rollen, Manager-Zuordnung, Arbeitszeitplan und Aktivierung.',
  'employees.showInactive': 'inaktive einblenden',
  'employees.count': '{count} Mitarbeiter:innen',
  'employees.new': 'Neuer Mitarbeiter',
  'employees.edit': 'Mitarbeiter bearbeiten',
  'employees.password': 'Passwort setzen',
  'employees.none': 'Keine Mitarbeiter:innen.',
  'employees.masterDataCreate': 'Stammdaten + Initial-Passwort',
  'employees.masterDataEdit': 'Stammdaten anpassen',
  'employees.noSchedule': '— kein Plan —',
  'employees.dailyBlock': 'Tagesblock',
  'employees.dailyBlockBooking': 'Direkte Tagesblockbuchung erlauben',
  'employees.dailyBlockBookingHint':
    'Die feste Nettozeit wird aus Wochenstunden und den Arbeitstagen des zugewiesenen Plans berechnet.',
  'employees.deactivateConfirm': 'Mitarbeiter:in {name} deaktivieren?',
  'employees.passwordUpdated': 'Passwort wurde aktualisiert.',
  'employees.newPassword': 'Neues Passwort (≥ 8 Zeichen)',
  'terminals.title': 'Login-Terminals',
  'terminals.description':
    'Tablets für Kommen-/Gehen-Buchungen mit optionaler Standortprüfung einrichten und koppeln.',
  'terminals.new': 'Terminal einrichten',
  'terminals.none': 'Noch keine Terminals eingerichtet.',
  'terminals.edit': 'Terminal bearbeiten',
  'terminals.editorDescription':
    'Anzeige und optional die zulässige GPS-Abweichung des montierten Tablets festlegen.',
  'terminals.name': 'Interner Name',
  'terminals.locationLabel': 'Angezeigter Ort',
  'terminals.displayText': 'Anzeigetext',
  'terminals.logoUrl': 'Logo (PNG, JPEG oder WebP, maximal 60 KiB)',
  'terminals.geofence': 'Standortprüfung',
  'terminals.enforceGeofence': 'GPS-Standort beim Scannen prüfen',
  'terminals.geofenceHint':
    'Ohne Standortprüfung funktioniert das Terminal ohne GPS-Berechtigung.',
  'terminals.geofenceEnabled': 'aktiv',
  'terminals.geofenceDisabled': 'deaktiviert',
  'terminals.geofenceDisabledHint':
    'Beim Scannen wird kein Standort angefordert und es werden keine GPS-Daten gespeichert. Ein weitergegebener QR-Code kann während seiner kurzen Gültigkeit dann ortsunabhängig verwendet werden.',
  'terminals.position': 'Terminal-Standort',
  'terminals.positionHint':
    'Die serverseitige Prüfung verwendet diese Koordinaten und den Radius.',
  'terminals.coordinates': 'Koordinaten',
  'terminals.latitude': 'Breitengrad',
  'terminals.longitude': 'Längengrad',
  'terminals.radius': 'Radius',
  'terminals.radiusMeters': 'Zulässiger Radius (Meter)',
  'terminals.accuracy': 'Max. GPS-Ungenauigkeit',
  'terminals.maxAccuracyMeters': 'Max. GPS-Ungenauigkeit (Meter)',
  'terminals.metersValue': '{count} m',
  'terminals.timeZone': 'IANA-Zeitzone',
  'terminals.device': 'Tablet',
  'terminals.paired': 'gekoppelt',
  'terminals.notPaired': 'nicht gekoppelt',
  'terminals.pairedDevices': 'Gekoppelte Geräte',
  'terminals.unnamedDevice': 'iPad-Terminal',
  'terminals.deviceLastSeen': 'Zuletzt online: {date}',
  'terminals.deviceNeverSeen': 'Noch nicht online gewesen',
  'terminals.revokeDevice': 'Gerät widerrufen',
  'terminals.revokeConfirm':
    'Dieses Gerät sofort widerrufen? Der Kiosk zeigt danach keinen QR-Code mehr an.',
  'terminals.revokeFailed': 'Das Gerät konnte nicht widerrufen werden.',
  'terminals.lastSeen': 'Zuletzt online',
  'terminals.activeHint': 'Terminal ist aktiv',
  'terminals.useCurrentPosition': 'Aktuelle Position übernehmen',
  'terminals.locating': 'Ermittle Position …',
  'terminals.geolocationUnavailable':
    'Dieser Browser stellt keine Standortermittlung bereit.',
  'terminals.geolocationFailed':
    'Die aktuelle Position konnte nicht ermittelt werden.',
  'terminals.saveFailed': 'Terminal konnte nicht gespeichert werden.',
  'terminals.loadFailed': 'Terminals konnten nicht geladen werden.',
  'terminals.deactivateFailed': 'Terminal konnte nicht deaktiviert werden.',
  'terminals.deactivateConfirm': 'Terminal „{name}“ wirklich deaktivieren?',
  'terminals.deletePermanently': 'Dauerhaft löschen',
  'terminals.deleteFailed': 'Terminal konnte nicht dauerhaft gelöscht werden.',
  'terminals.deleteConfirm':
    'Terminal „{name}“ dauerhaft löschen? Diese Aktion kann nicht rückgängig gemacht werden. Kopplungen und QR-Daten werden entfernt; bestehende Zeitbuchungen bleiben erhalten.',
  'terminals.pairDevice': 'Tablet koppeln',
  'terminals.pairingFailed': 'Kopplung konnte nicht vorbereitet werden.',
  'terminals.pairingTitle': 'iPad koppeln',
  'terminals.pairingDescription':
    'Öffne die URL auf dem iPad oder gib dort den einmaligen Code ein. Eine bestehende Kopplung wird widerrufen.',
  'terminals.pairingCode': 'Kopplungscode',
  'terminals.pairingUrl': 'Kiosk-URL',
  'terminals.copyUrl': 'Kiosk-URL kopieren',
  'terminals.copied': 'URL wurde kopiert.',
  'terminals.pairingExpires': 'Gültig bis {date}.',
  'terminals.supportTitle': 'OpenClockwork unterstützen?',
  'terminals.supportDescription':
    'Wenn das Terminal Ihrem Unternehmen hilft, können Sie die Weiterentwicklung freiwillig einmalig mit 125 € unterstützen.',
  'terminals.supportNoGate':
    'Das Terminal ist vollständig kostenlos und bleibt ohne Unterstützung uneingeschränkt nutzbar.',
  'terminals.continueWithoutSupport': 'Ohne Unterstützung fortfahren',
  'terminals.supportAction': 'Freiwillig unterstützen',
  'terminals.logoInvalidType':
    'Bitte nur ein PNG-, JPEG- oder WebP-Bild auswählen.',
  'terminals.logoTooLarge': 'Das Logo darf höchstens 60 KiB groß sein.',
  'terminals.removeLogo': 'Logo entfernen',
  'kiosk.setupTitle': 'Terminal koppeln',
  'kiosk.setupDescription':
    'Dieses iPad benötigt einen einmaligen Kopplungscode aus den HR-Einstellungen.',
  'kiosk.pairingCode': 'Kopplungscode',
  'kiosk.pairingPlaceholder': 'z. B. ABCD-1234',
  'kiosk.pair': 'Terminal koppeln',
  'kiosk.pairing': 'Kopple …',
  'kiosk.pairFailed': 'Der Kopplungscode ist ungültig oder abgelaufen.',
  'kiosk.loading': 'Lade Terminal …',
  'kiosk.refreshFailed': 'Terminal konnte nicht aktualisiert werden.',
  'kiosk.retry': 'Erneut versuchen',
  'kiosk.errorTitle': 'Terminal nicht verfügbar',
  'kiosk.offlineTitle': 'Keine Verbindung',
  'kiosk.offlinePairing':
    'Zum Koppeln ist eine Verbindung mit OpenClockwork erforderlich.',
  'kiosk.offlineDescription':
    'Der QR-Code wurde aus Sicherheitsgründen ausgeblendet. Er erscheint nach erfolgreicher Verbindung automatisch wieder.',
  'kiosk.defaultMessage': 'Willkommen! Zum Stempeln QR-Code scannen.',
  'kiosk.scanTitle': 'Kommen / Gehen',
  'kiosk.scanDescription':
    'Öffne OpenClockwork auf deinem Smartphone und scanne diesen Code.',
  'kiosk.refreshingTitle': 'Neuer QR-Code wird geladen',
  'kiosk.refreshingDescription':
    'Abgelaufene Codes werden automatisch ausgeblendet.',
  'kiosk.qrAlt': 'Kurzzeitig gültiger QR-Code für dieses Terminal',
  'kiosk.qrFailed': 'QR-Code konnte nicht erzeugt werden.',
  'kiosk.securityHint': 'Kurzzeitig gültig und serverseitig geprüft',
  'terminalScan.title': 'Terminal scannen',
  'terminalScan.description':
    'Scanne den QR-Code am Tablet. Falls konfiguriert, wird anschließend ein frischer Standort geprüft.',
  'terminalScan.actionTitle': 'Was möchtest du buchen?',
  'terminalScan.start': 'Kamera öffnen und QR-Code scannen',
  'terminalScan.working': 'Wird vorbereitet …',
  'terminalScan.cameraPreview': 'Kameravorschau für den QR-Code-Scan',
  'terminalScan.cameraIdle':
    'Die Kamera startet erst nach deiner ausdrücklichen Freigabe.',
  'terminalScan.locating': 'Aktueller Standort wird ermittelt …',
  'terminalScan.booking': 'Buchung wird sicher geprüft …',
  'terminalScan.privacyHint':
    'Die Kamera verarbeitet den QR-Code lokal. Standortdaten werden nur bei aktivierter Standortprüfung angefordert und als Buchungsnachweis gespeichert.',
  'terminalScan.offlineTitle': 'Offline nicht möglich',
  'terminalScan.offlineDescription':
    'Terminalbuchungen benötigen eine aktive Verbindung zum Server.',
  'terminalScan.errorTitle': 'Buchung nicht möglich',
  'terminalScan.successTitle': 'Buchung erfolgreich',
  'terminalScan.clockInSuccess': 'Du wurdest erfolgreich eingestempelt.',
  'terminalScan.clockOutSuccess': 'Du wurdest erfolgreich ausgestempelt.',
  'terminalScan.cameraDenied':
    'Der Kamerazugriff wurde abgelehnt. Erlaube ihn in den Browser-Einstellungen und versuche es erneut.',
  'terminalScan.cameraFailed':
    'Die Kamera konnte nicht gestartet werden. Prüfe, ob eine andere App sie verwendet und ob die Seite über HTTPS geöffnet ist.',
  'terminalScan.locationDenied':
    'Der Standortzugriff wurde abgelehnt. Ohne Standort ist keine Terminalbuchung möglich.',
  'terminalScan.locationTimeout':
    'Es konnte rechtzeitig kein genauer Standort ermittelt werden.',
  'terminalScan.locationFailed': 'Der Standort konnte nicht ermittelt werden.',
  'terminalScan.locationUnavailable':
    'Dieser Browser unterstützt keine Standortermittlung.',
  'terminalScan.bookingFailed': 'Die Terminalbuchung ist fehlgeschlagen.',
  'terminalScan.errorExpired':
    'Der QR-Code ist abgelaufen. Scanne den neuen Code am Tablet.',
  'terminalScan.errorInvalid': 'Der QR-Code gehört zu keinem aktiven Terminal.',
  'terminalScan.errorReplayed':
    'Dieser QR-Code wurde bereits verwendet. Scanne den aktuellen Code erneut.',
  'terminalScan.errorOutsideRadius':
    'Du befindest dich außerhalb des erlaubten Terminalbereichs.',
  'terminalScan.errorInaccurate':
    'Dein Standort ist derzeit zu ungenau. Warte kurz im Freien oder nahe einem Fenster und versuche es erneut.',
  'terminalScan.errorInactive': 'Dieses Terminal wurde deaktiviert.',
  'terminalScan.errorActionMismatch':
    'Die gewählte Aktion passt nicht zu deinem aktuellen Status. Wähle „Kommen“, wenn du nicht eingestempelt bist, beziehungsweise „Gehen“, wenn du bereits eingestempelt bist.',
  'terminalScan.errorBookingConflict':
    'Dein Buchungsstatus hat sich gerade geändert. Lade die Seite neu und versuche es erneut.',
  'terminalScan.errorPositionStale':
    'Der ermittelte Standort ist nicht frisch genug. Aktiviere Ortungsdienste und versuche es erneut.',
  'placeholder.description':
    'Diese Seite wird im Rahmen der laufenden Migration nach OpenClockwork in einem späteren Schritt portiert. Die alte Implementierung steht unter legacy/frontend/ als Referenz bereit.',
  'enum.Employee': 'Mitarbeiter:in',
  'enum.Manager': 'Vorgesetzte:r',
  'enum.HRAdmin': 'HR-Admin',
  'enum.Teilzeit': 'Teilzeit',
  'enum.Vollzeit': 'Vollzeit',
  'enum.Vertrauensarbeitszeit': 'Vertrauensarbeitszeit',
  'enum.Gleitzeit': 'Gleitzeit',
  'enum.Vacation': 'Urlaub',
  'enum.HomeOffice': 'Home-Office',
  'enum.SpecialLeave': 'Sonderurlaub',
  'enum.TimeAdjustment': 'Zeitkorrektur',
  'enum.TimeApproval': 'Zeitgenehmigung',
  'enum.Sickness': 'Krankheit',
  'enum.Training': 'Schulung',
  'enum.Flextime': 'Gleittag',
  'enum.Open': 'Offen',
  'enum.Pending': 'Ausstehend',
  'enum.Submitted': 'Eingereicht',
  'enum.PendingSubstitute': 'Wartet auf Vertretung',
  'enum.PendingManager': 'Wartet auf Vorgesetzte:n',
  'enum.PendingHr': 'Wartet auf HR',
  'enum.Approved': 'Genehmigt',
  'enum.Rejected': 'Abgelehnt',
  'enum.Cancelled': 'Storniert',
  'enum.Draft': 'Entwurf',
  'enum.LateArrival': 'Kernzeit zu spät begonnen',
  'enum.EarlyDeparture': 'Kernzeit zu früh beendet',
  'enum.MidDayGap': 'Unterbrechung während der Kernzeit',
  'enum.ManagerApproved': 'Vom Management genehmigt',
  'enum.ManagerRejected': 'Vom Management abgelehnt',
  'enum.HrConfirmed': 'Von HR bestätigt',
  'enum.HrRejected': 'Von HR abgelehnt',
  'enum.SubstituteAccepted': 'Von Vertretung angenommen',
  'enum.SubstituteDeclined': 'Von Vertretung abgelehnt',
  'enum.Returned': 'Zur Überarbeitung zurückgegeben',
};

const en: Catalog = {
  ...soloEn,
  'projects.deleteFailed': 'Could not delete project',
  'projects.deleteHint':
    'Deletion is available only while no time has been recorded',
  'projects.deleteOrderHint':
    'Deletion is available only while no time has been recorded against the order',
  'projects.createFailed': 'Creation failed',
  'common.deleteFailed': 'Deletion failed',
  'projects.orderNo': 'Order number',
  'projects.orderTitle': 'Title',
  'projects.orderPlaceholder': 'e.g. Concept & design',
  'projects.planHours': 'Planned hours',
  'projects.planHoursHint': 'Planned hours (empty = no plan)',
  'projects.assignments': 'Assignment matrix',
  'projects.assignmentsHint':
    'Only assigned employees can record time against a project.',
  'booking.splitFailed': 'Split failed',
  'booking.rangeFailed': 'Retroactive booking failed',
  'booking.inheritProject': '— same as first part ({project}) —',
  'booking.inheritNoProject': '— same as first part (no project) —',
  'booking.splitInvalid':
    'The split time must be strictly between clock-in and clock-out.',
  'booking.rangeAction': 'Add time',
  'employees.passwordFailed': 'Could not set password',
  'employees.passwordSetting': 'Setting…',
  'employees.passwordSet': 'Set password',
  'projects.noPlan': 'Actual {hours} · no plan defined',
  'projects.planComparison': 'Actual {actual} / Planned {planned}',
  'projects.reportDescription':
    'Recorded time and activities, available as a CSV export to share with the client.',
  'projects.reportDate': 'Date',
  'projects.reportOrder': 'Order',
  'projects.reportTotal': 'Total',
  'projects.reportEmpty': 'No entries in the selected period.',
  'projects.downloadCsv': 'Download CSV',
  'booking.summary': 'Gross {gross} · Break {break}min · Net {net}',
  'booking.since': 'Since {date}',
  'booking.failed': 'Booking failed',
  'booking.clockOutFailed': 'Clock-out failed',
  'booking.splitDescription':
    '{from} – {to} is split into two entries at the selected time, for example to switch projects.',
  'booking.splitAt': 'Split time',
  'booking.splitProject': 'Project for the second part',
  'booking.splitKeepProject': 'Keep project',
  'booking.splitOtherProject': 'Choose another project…',
  'booking.rangeDescription':
    'Assign a previously recorded work interval to a project. The interval must already be recorded as working time.',
  'requests.submitFailed': 'Request failed',
  'requests.firstHalfDay': 'Half first day',
  'requests.lastHalfDay': 'Half last day',
  'requests.attachmentLabel': 'Attachment (optional, max 10 MB)',
  'requests.balanceHint':
    '{remaining} days available ({total} total − {approved} approved − {pending} submitted).',
  'requests.timeAdjustmentPolicy':
    'Approvals follow your work schedule. Time outside its configured frame requires additional approval before HR confirmation.',
  'requests.invalidTimeRange': '"To" must be after "From".',
  'requests.invalidDateRange': '"To" must not be before "From".',
  'schedules.breakRules': 'Automatic break deduction',
  'schedules.breakRulesHint':
    'Empty rules mean no automatic deduction. At the specified attendance duration, the largest matching total break is deducted. Set rules according to the contract and local requirements.',
  'schedules.noBreakRules': 'No automatic break deduction',
  'schedules.addBreakRule': 'Add break rule',
  'schedules.breakAfter': 'Attendance threshold (minutes)',
  'schedules.breakMinutes': 'Total deduction (minutes)',
  'schedules.breakRuleSummary': 'at {after} min: {deduction} min',
  'schedules.frame': 'Working-time frame',
  'schedules.frameStart': 'Frame start',
  'schedules.frameEnd': 'Frame end',
  'schedules.workingDays': 'Working days',
  'schedules.workingDaysHint':
    'Only selected days count toward target hours and leave deductions. Match this selection to the employment contract.',
  'schedules.defaultHint':
    'Use as the default when no individual schedule is assigned',
  'schedules.assignedResult': '{assigned} assigned, {skipped} skipped',
  'schedules.assigning': 'Assigning…',
  'schedules.bulkAssign': 'Assign in bulk',
  'schedules.deleteHint': 'Assign all employees to another schedule first',
  'schedules.coreLabel': 'Label',
  'schedules.corePlaceholder': 'e.g. Morning',
  'schedules.start': 'Start',
  'schedules.end': 'End',
  'requests.auditHistory': 'Audit history',
  'approvals.reviseDefault': 'Please revise',
  'employees.holidayCalendar': 'Holiday calendar',
  'employees.holidayCalendarNone': 'No preset calendar',
  'employees.holidayCalendarGermany': 'Germany · {region}',
  'employees.holidayDates': 'Additional holidays',
  'employees.holidayDatesHint':
    'For any country: enter holidays as YYYY-MM-DD, separated by commas or line breaks. These supplement the selected calendar. Without a calendar or dates, no holidays are deducted.',
  'employees.holidaySummary': '{calendar} · {count} additional dates',
  'employees.holidayDatesInvalid': 'Use valid dates in YYYY-MM-DD format.',
  'employees.personalNo': 'Employee number',
  'employees.timeModel': 'Time model',
  'employees.weeklyHours': 'Weekly hours',
  'employees.annualLeaveDays': 'Annual leave (days)',
  'employees.startDate': 'Employment start date',
  'employees.overtimeBalance': 'Opening overtime balance (minutes, ± allowed)',
  'employees.overtimeBalanceShort': 'Opening balance',
  'employees.overtimeBalanceHint': '{minutes} min opening balance',
  'employees.workSchedule': 'Work schedule',
  'employees.firstName': 'First name',
  'employees.lastName': 'Last name',
  'employees.initialPassword': 'Initial password (≥ 8 characters)',
  'employees.activeHint': 'Active (inactive employees cannot sign in)',
  'employees.passwordFor': 'For {name} ({email})',
  'nav.dashboard': 'Dashboard',
  'language.de': 'German',
  'language.en': 'English',
  'language.change': 'Change language',
  'common.loading': 'Loading …',
  'common.save': 'Save',
  'common.saving': 'Saving…',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.remove': 'Remove',
  'common.approve': 'Approve',
  'common.reject': 'Reject',
  'common.optional': 'optional',
  'common.none': '— none —',
  'common.all': '— all —',
  'common.from': 'From',
  'common.to': 'To',
  'common.type': 'Type',
  'common.note': 'Note',
  'common.reason': 'Reason',
  'common.employee': 'Employee',
  'common.project': 'Project',
  'common.activity': 'Activity',
  'common.days': 'days',
  'common.hours': 'hours',
  'common.status': 'Status',
  'common.actions': 'Actions',
  'common.name': 'Name',
  'common.description': 'Description',
  'common.email': 'Email',
  'common.role': 'Role',
  'common.manager': 'Manager',
  'common.select': '— select —',
  'common.default': '— Default —',
  'common.active': 'Active',
  'common.inactive': 'Inactive',
  'common.activate': 'Activate',
  'common.reactivate': 'Reactivate',
  'common.deactivate': 'Deactivate',
  'common.create': 'Create',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.minutes': 'minutes',
  'common.calendarDays': 'calendar days',
  'common.saveFailed': 'Saving failed',
  'common.hrOnly': 'This page is restricted to HR admins.',
  'nav.terminalScan': 'Terminal',
  'nav.booking': 'Booking',
  'nav.calendar': 'Calendar',
  'nav.requests': 'Requests',
  'nav.substitute': 'Substitutions',
  'nav.absences': 'Absences',
  'nav.approvals': 'Approvals',
  'nav.projects': 'Projects',
  'nav.workingTimes': 'Working times',
  'nav.schedules': 'Work schedules',
  'nav.employees': 'Employees',
  'nav.terminals': 'Terminals',
  'shell.profile': 'Profile',
  'shell.accountMenu': 'Open account menu',
  'shell.signedInAs': 'Signed in as',
  'shell.signOut': 'Sign out',
  'shell.mainNavigation': 'Main navigation',
  'shell.mobileNavigation': 'Mobile navigation',
  'shell.more': 'More',
  'shell.moreAreas': 'More areas',
  'shell.openMore': 'Open more areas',
  'shell.closeMore': 'Close more areas',
  'shell.closeMenu': 'Close menu',
  'shell.install': 'Install',
  'shell.installHint':
    'Install OpenClockwork as an app for faster access and offline notices.',
  'shell.closeInstall': 'Close installation notice',
  'shell.adminFooter': 'Crafted with ❤️ in Würzburg by Patrick Schiller',
  'shell.adminVersion': 'OpenClockwork version {version}',
  'login.description': 'Sign in with email and password',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in…',
  'login.failed': 'Sign-in failed',
  'login.invalidCredentials': 'The email address or password is incorrect.',
  'login.connectionFailed':
    'The server cannot be reached. Check your connection and try again.',
  'login.serverUnavailable':
    'Sign-in is currently unavailable because of a server problem. Try again later or contact an administrator.',
  'login.demoCredentials': 'Demo credentials',
  'demo.title': 'Public demo environment',
  'demo.description':
    'Do not enter real personal data. All entered data and attachments are reset every night.',
  'theme.Light': 'Light',
  'theme.Dark': 'Dark',
  'theme.System': 'System setting',
  'theme.title': 'Theme: {label} (click to change)',
  'theme.aria': 'Change theme. Current: {label}',
  'app.notFound': 'Not found',
  'app.notFoundHint': 'This page does not exist.',
  'dashboard.welcome': 'Welcome, {name}.',
  'dashboard.remainingLeave': 'Remaining leave',
  'dashboard.overtime': 'Overtime balance',
  'dashboard.violationsYtd': 'Core-time violations YTD',
  'dashboard.noViolations': 'No violations detected',
  'dashboard.violationsDetected': 'Core-time violations detected',
  'dashboard.currentBooking': 'Current booking',
  'dashboard.openRequests': 'Open requests',
  'dashboard.noOpenRequests': 'No open requests.',
  'dashboard.allRequests': 'All requests',
  'dashboard.notClockedIn': 'You are currently not clocked in.',
  'dashboard.clockInOut': 'Clock in / out',
  'dashboard.bookingPage': 'Go to booking page',
  'dashboard.vacation': 'Vacation {year}',
  'dashboard.createRequest': 'Create request',
  'dashboard.violationLate': '{count} late',
  'dashboard.violationEarly': '{count} early',
  'dashboard.violationMid': '{count} core-time gap',
  'dashboard.violationDetails':
    '{count} violation(s) this year — details are available on the booking page.',
  'dashboard.carryOver': 'Carry-over',
  'dashboard.approved': 'Approved',
  'dashboard.carryOverExpires': 'Carry-over expires soon',
  'dashboard.carryOverExpiresDescription':
    '{days} days of remaining leave from the previous year must be taken by {date}.',
  'dashboard.plannedVacations': 'Planned vacations',
  'dashboard.noPlannedVacations':
    'There are currently no upcoming or submitted vacations.',
  'dashboard.daysValue': '{count} days',
  'dashboard.leaveHint':
    '{approved} approved · {pending} pending · {total} total',
  'dashboard.clockedInSince': 'Clocked in since {date}.',
  'dashboard.planned': '{used} of {total} days planned',
  'dashboard.remaining': '{count} remaining',
  'dashboard.remainingLabel': 'Remaining',
  'dashboard.leaveUsage': 'Leave usage: {used} of {total} days',
  'dashboard.daysApproved': '{count} days approved',
  'dashboard.daysPending': '{count} days pending',
  'dashboard.entitlement': 'Entitlement',
  'dashboard.baseEntitlement': 'Base entitlement',
  'dashboard.adjustment': 'Adjustment',
  'dashboard.total': 'Total',
  'dashboard.usage': 'Usage',
  'dashboard.pending': 'Pending',
  'dashboard.workDays': '{count} workdays',
  'booking.title': 'Booking',
  'booking.description':
    'Clock in / out with optional GPS and project booking.',
  'booking.clockIn': 'Clock in',
  'booking.clockOut': 'Clock out',
  'booking.clockedIn': 'Clocked in',
  'booking.notClockedIn': 'Not clocked in',
  'booking.lastEntries': 'Recent bookings',
  'booking.noEntries': 'No bookings yet.',
  'booking.approval': 'Approval',
  'booking.violations': 'Core-time violations this year ({count})',
  'booking.noViolations': 'No core-time violations detected.',
  'booking.violation': 'Violation',
  'booking.offlineDescription':
    'No connection to the server. Booking is currently disabled and will be available again when you are online.',
  'booking.offHours': 'Outside regular hours',
  'booking.offHoursDescription':
    'Bookings outside the configured working-time frame require approval.',
  'booking.startHint': 'Press “Clock in” to start a new session.',
  'booking.sendLocation': 'Send location when clocking in or out (optional)',
  'booking.orderRequired': 'This project requires selecting a service order.',
  'booking.violationDescription':
    'Every core-time window that is not fully covered counts as a separate violation. The current day is checked retrospectively.',
  'booking.coreTime': 'Core time',
  'booking.minutesUncovered': '{count} minutes not covered',
  'booking.edit': 'Edit booking',
  'booking.split': 'Split booking',
  'booking.splitAction': 'Split',
  'booking.splitPending': 'Splitting…',
  'booking.bookProjectTime': 'Add project time',
  'booking.open': 'open',
  'booking.noProject': '— no project —',
  'booking.chooseProject': '— select project —',
  'booking.chooseOrder': '— select order —',
  'booking.serviceOrder': 'Service order',
  'booking.serviceOrderRequired': 'Service order (required)',
  'booking.activityForReport': 'Activity (for the customer report)',
  'booking.activityPlaceholder': 'e.g. created homepage concept',
  'booking.dailyBlockHint':
    'Alternatively, book your daily target of {net} as one completed block.',
  'booking.dailyBlockAction': 'Book daily block',
  'booking.dailyBlockSource': 'Daily block',
  'booking.dailyBlockTitle': 'Book working time as a daily block',
  'booking.dailyBlockDescription':
    'The fixed daily target is booked as approved immediately. Use clock in and out instead when your hours differ.',
  'booking.dailyBlockDate': 'Working day',
  'booking.dailyBlockStart': 'Start',
  'booking.dailyBlockPreview': '{start}–{end}',
  'booking.dailyBlockCalculation':
    '{gross} attendance − {break} break = {net} working time',
  'booking.dailyBlockSubmit': 'Confirm block booking',
  'booking.dailyBlockSaving': 'Booking…',
  'booking.dailyBlockFailed': 'The daily block could not be booked.',
  'booking.dailyBlockErrorInvalidDateTime':
    'The date or start time is invalid.',
  'booking.dailyBlockErrorDisabled':
    'Daily-block booking is not enabled for your account.',
  'booking.dailyBlockErrorFutureDate':
    'Daily blocks cannot be booked in advance.',
  'booking.dailyBlockErrorBeforeEmployment':
    'The selected date is before your employment start date.',
  'booking.dailyBlockErrorNoDailyTarget':
    'No valid daily work target is configured for your account.',
  'booking.dailyBlockErrorNonWorkingDay':
    'The selected date is not a working day in your schedule.',
  'booking.dailyBlockErrorPublicHoliday':
    'The selected date is a public holiday.',
  'booking.dailyBlockErrorOutsideFrame':
    'The daily block must stay within the configured working-time frame.',
  'booking.dailyBlockErrorTimeEntryConflict':
    'The selected day already contains a time entry. Please choose a free working day.',
  'booking.dailyBlockErrorAbsenceConflict':
    'The selected day is covered by an absence or active request.',
  'booking.dailyBlockErrorAlreadyExists':
    'A daily block has already been booked for the selected day.',
  'requests.title': 'Requests',
  'requests.description':
    'Vacation, home office, special leave, time adjustments',
  'requests.new': 'New request',
  'requests.own': 'My requests',
  'requests.none': 'No requests yet.',
  'requests.specialApproval': 'Special approval',
  'requests.submit': 'Submit request',
  'requests.chooseTypeRange': 'Choose type and period',
  'requests.reasonOptional': 'Reason (optional)',
  'requests.substituteOptional': 'Substitute (optional)',
  'calendar.title': 'Calendar {year}',
  'calendar.description':
    'Approved and open requests plus absences in the annual overview',
  'calendar.previousYear': 'Previous year',
  'calendar.nextYear': 'Next year',
  'substitute.title': 'Substitution inbox',
  'substitute.description': 'Requests where you have been named as substitute',
  'substitute.open': 'Open ({count})',
  'substitute.none': 'No substitution requests.',
  'substitute.accept': 'Accept',
  'substitute.noteRequired': 'Note (required when declining)',
  'absences.title': 'Absences',
  'absences.entries': '{count} entries',
  'absences.none': 'No entries.',
  'absences.description':
    'Sickness, training, and flextime days are recorded as facts without approval. Managers and HR can create entries for employees they supervise.',
  'absences.employeeHint':
    'Select a person, or leave empty to show all employees.',
  'absences.create': 'Record absence',
  'absences.certificate': 'medical certificate is available',
  'absences.deleteConfirm': 'Really delete this entry?',
  'absences.certificateShort': 'Certificate',
  'absences.show': 'Show',
  'absences.employeeFilter': 'Filter absences by employee',
  'absences.noNote': 'no note',
  'absences.certificateProvided': 'Certificate provided',
  'absences.withoutCertificate': 'without certificate',
  'absences.editorDescription': 'Type, period, and optional note',
  'absences.noteOptional': 'Note (optional)',
  'absences.flextimeNotice':
    'Note: Flextime days currently do not reduce the overtime balance automatically. Automatic accounting will follow in a later iteration; the calendar and list already show the entry correctly.',
  'approvals.title': 'Approvals',
  'approvals.restricted': 'This page is restricted to managers and HR admins.',
  'approvals.hrInbox': 'HR inbox: all requests in “Pending HR” status',
  'approvals.managerInbox':
    'Manager inbox: requests where you are the next approver',
  'approvals.inbox': 'Inbox ({count})',
  'approvals.selectAll': 'Select all',
  'approvals.clearSelection': 'Clear selection',
  'approvals.noOpen': 'No open requests.',
  'approvals.lastActivity': 'Recent activity',
  'approvals.selected': '{count} request(s) selected',
  'approvals.approveRequests': 'Approve requests',
  'approvals.rejectRequests': 'Reject requests',
  'approvals.approveDescription':
    'Manager inbox items are approved directly; HR inbox items are confirmed by HR. Time adjustments outside regular hours automatically proceed to the HR stage.',
  'approvals.rejectDescription':
    'A note is required and will be added to every request.',
  'approvals.hrRequired':
    'HR confirmation required (for all manager inbox items)',
  'approvals.selectRequest': 'Select request',
  'approvals.outsideFrame':
    'Outside the working-time frame — approval automatically runs in two stages (manager, then HR).',
  'approvals.hrConfirm': 'Confirm by HR',
  'approvals.return': 'Return for correction',
  'approvals.history': 'History',
  'projects.title': 'Projects',
  'projects.description':
    'Structure projects with service orders, maintain planned time, and enable employees for project booking.',
  'projects.new': 'New project',
  'projects.none': 'No projects yet.',
  'projects.report': 'Report',
  'projects.overbooked': 'Overbooked',
  'projects.serviceOrders': 'Service orders',
  'projects.noServiceOrders': 'No service orders.',
  'projects.edit': 'Edit project',
  'projects.editorDescription':
    'The project code is unique and appears in the ERP export. Planned project time limits the total planned service-order time.',
  'projects.activeHint': 'Active (bookable by assigned employees)',
  'reports.title': 'Working times',
  'reports.description':
    'Project-independent overview of recorded working times.',
  'reports.filters': 'Filters',
  'reports.rangeHint': 'The date range may contain at most 366 days.',
  'reports.date': 'Date',
  'reports.start': 'Start',
  'reports.clockInLocation': 'Clock-in location',
  'reports.end': 'End',
  'reports.clockOutLocation': 'Clock-out location',
  'reports.includeLocations': 'Include clocking locations',
  'reports.gross': 'Gross',
  'reports.break': 'Break',
  'reports.net': 'Net',
  'reports.total': 'Total',
  'reports.result': 'Report',
  'reports.projectIndependent':
    'Closed, non-rejected entries, independent of projects.',
  'reports.downloadCsv': 'Download CSV',
  'reports.empty': 'No entries in the selected date range.',
  'reports.invalidRange':
    'The from date must be before or equal to the to date.',
  'reports.loadFailed': 'Working times could not be loaded',
  'reports.adminOnly': 'This page is restricted to HR admins.',
  'schedules.title': 'Work schedules',
  'schedules.description':
    'Working-time frames and core times per schedule, assigned to employees or entire time models.',
  'schedules.new': 'New schedule',
  'schedules.none': 'No work schedules yet.',
  'schedules.employees': '{count} employees',
  'schedules.assign': 'Assign',
  'schedules.timeModel': 'Time model',
  'schedules.assignEmployee': 'Assign an individual employee',
  'schedules.override': 'Override existing assignments',
  'schedules.coreTimes': 'Core times',
  'schedules.noCoreTime': 'no core time',
  'schedules.addCoreTime': 'Add core time',
  'schedules.noCoreTimes': 'No core times — suitable for trust-based work.',
  'schedules.edit': 'Edit schedule',
  'schedules.editorDescription':
    'Working-time frame and any number of core times per weekday',
  'employees.title': 'Employees',
  'employees.description':
    'Master data, roles, manager assignment, work schedule, and activation.',
  'employees.showInactive': 'show inactive',
  'employees.count': '{count} employees',
  'employees.new': 'New employee',
  'employees.edit': 'Edit employee',
  'employees.password': 'Set password',
  'employees.none': 'No employees.',
  'employees.masterDataCreate': 'Master data + initial password',
  'employees.masterDataEdit': 'Edit master data',
  'employees.noSchedule': '— no schedule —',
  'employees.dailyBlock': 'Daily block',
  'employees.dailyBlockBooking': 'Allow direct daily-block booking',
  'employees.dailyBlockBookingHint':
    'The fixed net duration is derived from weekly hours and the assigned schedule’s working days.',
  'employees.deactivateConfirm': 'Deactivate employee {name}?',
  'employees.passwordUpdated': 'Password has been updated.',
  'employees.newPassword': 'New password (at least 8 characters)',
  'terminals.title': 'Login terminals',
  'terminals.description':
    'Set up and pair tablets for clock-in and clock-out bookings with optional location checks.',
  'terminals.new': 'Set up terminal',
  'terminals.none': 'No terminals have been set up.',
  'terminals.edit': 'Edit terminal',
  'terminals.editorDescription':
    'Configure the display and optionally the permitted GPS deviation of the mounted tablet.',
  'terminals.name': 'Internal name',
  'terminals.locationLabel': 'Displayed location',
  'terminals.displayText': 'Display text',
  'terminals.logoUrl': 'Logo (PNG, JPEG, or WebP; no more than 60 KiB)',
  'terminals.geofence': 'Location check',
  'terminals.enforceGeofence': 'Check GPS location when scanning',
  'terminals.geofenceHint':
    'Without a location check, the terminal works without GPS permission.',
  'terminals.geofenceEnabled': 'enabled',
  'terminals.geofenceDisabled': 'disabled',
  'terminals.geofenceDisabledHint':
    'Scanning will not request a location and no GPS data will be stored. A shared QR code can then be used from any location during its short validity window.',
  'terminals.position': 'Terminal location',
  'terminals.positionHint':
    'The server-side check uses these coordinates and this radius.',
  'terminals.coordinates': 'Coordinates',
  'terminals.latitude': 'Latitude',
  'terminals.longitude': 'Longitude',
  'terminals.radius': 'Radius',
  'terminals.radiusMeters': 'Permitted radius (meters)',
  'terminals.accuracy': 'Maximum GPS inaccuracy',
  'terminals.maxAccuracyMeters': 'Maximum GPS inaccuracy (meters)',
  'terminals.metersValue': '{count} m',
  'terminals.timeZone': 'IANA time zone',
  'terminals.device': 'Tablet',
  'terminals.paired': 'paired',
  'terminals.notPaired': 'not paired',
  'terminals.pairedDevices': 'Paired devices',
  'terminals.unnamedDevice': 'iPad terminal',
  'terminals.deviceLastSeen': 'Last online: {date}',
  'terminals.deviceNeverSeen': 'Never connected',
  'terminals.revokeDevice': 'Revoke device',
  'terminals.revokeConfirm':
    'Revoke this device immediately? The kiosk will stop displaying QR codes.',
  'terminals.revokeFailed': 'The device could not be revoked.',
  'terminals.lastSeen': 'Last online',
  'terminals.activeHint': 'Terminal is active',
  'terminals.useCurrentPosition': 'Use current location',
  'terminals.locating': 'Getting location …',
  'terminals.geolocationUnavailable':
    'This browser does not provide geolocation.',
  'terminals.geolocationFailed':
    'The current location could not be determined.',
  'terminals.saveFailed': 'The terminal could not be saved.',
  'terminals.loadFailed': 'The terminals could not be loaded.',
  'terminals.deactivateFailed': 'The terminal could not be deactivated.',
  'terminals.deactivateConfirm': 'Really deactivate terminal “{name}”?',
  'terminals.deletePermanently': 'Delete permanently',
  'terminals.deleteFailed': 'The terminal could not be permanently deleted.',
  'terminals.deleteConfirm':
    'Permanently delete terminal “{name}”? This cannot be undone. Pairings and QR data will be removed; existing time entries will remain.',
  'terminals.pairDevice': 'Pair tablet',
  'terminals.pairingFailed': 'Pairing could not be prepared.',
  'terminals.pairingTitle': 'Pair iPad',
  'terminals.pairingDescription':
    'Open the URL on the iPad or enter the one-time code there. An existing pairing will be revoked.',
  'terminals.pairingCode': 'Pairing code',
  'terminals.pairingUrl': 'Kiosk URL',
  'terminals.copyUrl': 'Copy kiosk URL',
  'terminals.copied': 'The URL has been copied.',
  'terminals.pairingExpires': 'Valid until {date}.',
  'terminals.supportTitle': 'Support OpenClockwork?',
  'terminals.supportDescription':
    'If the terminal helps your company, you can voluntarily support its continued development once with €125.',
  'terminals.supportNoGate':
    'The terminal is completely free and remains fully usable without support.',
  'terminals.continueWithoutSupport': 'Continue without support',
  'terminals.supportAction': 'Support voluntarily',
  'terminals.logoInvalidType': 'Please select a PNG, JPEG, or WebP image only.',
  'terminals.logoTooLarge': 'The logo must not be larger than 60 KiB.',
  'terminals.removeLogo': 'Remove logo',
  'kiosk.setupTitle': 'Pair terminal',
  'kiosk.setupDescription':
    'This iPad needs a one-time pairing code from the HR settings.',
  'kiosk.pairingCode': 'Pairing code',
  'kiosk.pairingPlaceholder': 'e.g. ABCD-1234',
  'kiosk.pair': 'Pair terminal',
  'kiosk.pairing': 'Pairing …',
  'kiosk.pairFailed': 'The pairing code is invalid or has expired.',
  'kiosk.loading': 'Loading terminal …',
  'kiosk.refreshFailed': 'The terminal could not be refreshed.',
  'kiosk.retry': 'Try again',
  'kiosk.errorTitle': 'Terminal unavailable',
  'kiosk.offlineTitle': 'No connection',
  'kiosk.offlinePairing':
    'A connection to OpenClockwork is required for pairing.',
  'kiosk.offlineDescription':
    'The QR code has been hidden for security. It will reappear automatically after a successful connection.',
  'kiosk.defaultMessage': 'Welcome! Scan the QR code to clock in or out.',
  'kiosk.scanTitle': 'Clock in / out',
  'kiosk.scanDescription':
    'Open OpenClockwork on your phone and scan this code.',
  'kiosk.refreshingTitle': 'Loading a new QR code',
  'kiosk.refreshingDescription': 'Expired codes are hidden automatically.',
  'kiosk.qrAlt': 'Short-lived QR code for this terminal',
  'kiosk.qrFailed': 'The QR code could not be generated.',
  'kiosk.securityHint': 'Short-lived and validated by the server',
  'terminalScan.title': 'Scan terminal',
  'terminalScan.description':
    'Scan the code on the tablet. If configured, a fresh location is then checked.',
  'terminalScan.actionTitle': 'What would you like to book?',
  'terminalScan.start': 'Open camera and scan QR code',
  'terminalScan.working': 'Preparing …',
  'terminalScan.cameraPreview': 'Camera preview for scanning the QR code',
  'terminalScan.cameraIdle':
    'The camera starts only after you explicitly allow it.',
  'terminalScan.locating': 'Getting your current location …',
  'terminalScan.booking': 'Securely checking booking …',
  'terminalScan.privacyHint':
    'The camera processes the QR code locally. Location data is requested and stored as booking evidence only when the location check is enabled.',
  'terminalScan.offlineTitle': 'Unavailable offline',
  'terminalScan.offlineDescription':
    'Terminal bookings require an active server connection.',
  'terminalScan.errorTitle': 'Booking unavailable',
  'terminalScan.successTitle': 'Booking successful',
  'terminalScan.clockInSuccess': 'You have successfully clocked in.',
  'terminalScan.clockOutSuccess': 'You have successfully clocked out.',
  'terminalScan.cameraDenied':
    'Camera access was denied. Allow it in the browser settings and try again.',
  'terminalScan.cameraFailed':
    'The camera could not be started. Check whether another app is using it and whether this page is opened over HTTPS.',
  'terminalScan.locationDenied':
    'Location access was denied. A terminal booking requires your location.',
  'terminalScan.locationTimeout':
    'An accurate location could not be obtained in time.',
  'terminalScan.locationFailed': 'Your location could not be determined.',
  'terminalScan.locationUnavailable':
    'This browser does not support geolocation.',
  'terminalScan.bookingFailed': 'The terminal booking failed.',
  'terminalScan.errorExpired':
    'The QR code has expired. Scan the new code on the tablet.',
  'terminalScan.errorInvalid':
    'The QR code does not belong to an active terminal.',
  'terminalScan.errorReplayed':
    'This QR code has already been used. Scan the current code again.',
  'terminalScan.errorOutsideRadius':
    'You are outside the permitted terminal area.',
  'terminalScan.errorInaccurate':
    'Your location is currently too inaccurate. Wait briefly outdoors or near a window, then try again.',
  'terminalScan.errorInactive': 'This terminal has been deactivated.',
  'terminalScan.errorActionMismatch':
    'The selected action does not match your current status. Choose “Clock in” when you are not clocked in, or “Clock out” when you are already clocked in.',
  'terminalScan.errorBookingConflict':
    'Your booking status has just changed. Reload the page and try again.',
  'terminalScan.errorPositionStale':
    'The reported location is not recent enough. Enable Location Services and try again.',
  'placeholder.description':
    'This page will be ported to OpenClockwork in a later migration step. The old implementation remains available under legacy/frontend/ for reference.',
  'enum.Employee': 'Employee',
  'enum.Manager': 'Manager',
  'enum.HRAdmin': 'HR admin',
  'enum.Teilzeit': 'Part-time',
  'enum.Vollzeit': 'Full-time',
  'enum.Vertrauensarbeitszeit': 'Trust-based working time',
  'enum.Gleitzeit': 'Flextime',
  'enum.Vacation': 'Vacation',
  'enum.HomeOffice': 'Home office',
  'enum.SpecialLeave': 'Special leave',
  'enum.TimeAdjustment': 'Time adjustment',
  'enum.TimeApproval': 'Time approval',
  'enum.Sickness': 'Sickness',
  'enum.Training': 'Training',
  'enum.Flextime': 'Flextime day',
  'enum.Open': 'Open',
  'enum.Pending': 'Pending',
  'enum.Submitted': 'Submitted',
  'enum.PendingSubstitute': 'Pending substitute',
  'enum.PendingManager': 'Pending manager',
  'enum.PendingHr': 'Pending HR',
  'enum.Approved': 'Approved',
  'enum.Rejected': 'Rejected',
  'enum.Cancelled': 'Cancelled',
  'enum.Draft': 'Draft',
  'enum.LateArrival': 'Core time started late',
  'enum.EarlyDeparture': 'Core time ended early',
  'enum.MidDayGap': 'Gap during core time',
  'enum.ManagerApproved': 'Approved by manager',
  'enum.ManagerRejected': 'Rejected by manager',
  'enum.HrConfirmed': 'Confirmed by HR',
  'enum.HrRejected': 'Rejected by HR',
  'enum.SubstituteAccepted': 'Accepted by substitute',
  'enum.SubstituteDeclined': 'Declined by substitute',
  'enum.Returned': 'Returned for revision',
};

export const catalogs: Record<Locale, Catalog> = { de, en };

function interpolate(value: string, variables?: Variables): string {
  if (!variables) return value;
  return value.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(variables[key] ?? `{${key}}`),
  );
}

interface I18nContextValue {
  locale: Locale;
  languageTag: string;
  setLocale: (locale: Locale) => void;
  t: (key: string, variables?: Variables) => string;
  enumLabel: (value: string) => string;
  formatDate: (value: Date | string) => string;
  formatDateTime: (value: Date | string) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function initialLocale(): Locale {
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    if (stored === 'de' || stored === 'en') return stored;
  } catch {
    // Storage can be unavailable in private browsing and isolated tests.
  }
  for (const language of browserLanguages()) {
    const candidate = language.toLowerCase().split('-')[0];
    if (candidate === 'de' || candidate === 'en') return candidate;
  }
  return 'en';
}

function browserLanguages(): readonly string[] {
  return typeof navigator === 'undefined'
    ? []
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language];
}

/** Keep regional date/number conventions without tying a UI language to a country. */
function languageTagFor(locale: Locale): string {
  for (const language of browserLanguages()) {
    if (language?.toLowerCase().split('-')[0] !== locale) continue;
    try {
      return Intl.getCanonicalLocales(language)[0];
    } catch {
      // Ignore malformed browser language preferences.
    }
  }
  return locale;
}

function localizedDate(raw: Date | string): Date {
  // Date-only API values are calendar dates, not instants at midnight UTC.
  return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00`)
    : new Date(raw);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    try {
      window.localStorage?.setItem(STORAGE_KEY, locale);
    } catch {
      // Language selection must work when browser storage is unavailable.
    }
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: string, variables?: Variables) =>
      interpolate(catalogs[locale][key] ?? catalogs.en[key] ?? key, variables);
    const languageTag = languageTagFor(locale);
    return {
      locale,
      languageTag,
      setLocale,
      t,
      enumLabel: (raw) => t(`enum.${raw}`),
      formatDate: (raw) => localizedDate(raw).toLocaleDateString(languageTag),
      formatDateTime: (raw) => new Date(raw).toLocaleString(languageTag),
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (context) return context;
  const locale = initialLocale();
  const languageTag = languageTagFor(locale);
  const t = (key: string, variables?: Variables) =>
    interpolate(catalogs[locale][key] ?? catalogs.en[key] ?? key, variables);
  return {
    locale,
    languageTag,
    setLocale: () => undefined,
    t,
    enumLabel: (raw) => t(`enum.${raw}`),
    formatDate: (raw) => localizedDate(raw).toLocaleDateString(languageTag),
    formatDateTime: (raw) => new Date(raw).toLocaleString(languageTag),
  };
}
