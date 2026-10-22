# Arbeitszeitnachweise als PDF

OpenClockwork bietet neben CSV einen PDF-Download für Arbeitszeitnachweise. HR kann einen Mitarbeiter, mehrere ausgewählte Mitarbeiter oder alle Mitarbeiter des gewählten Zeitraums gemeinsam exportieren. Jeder Mitarbeiter beginnt im Sammeldokument auf einer eigenen Seite; weitere Seiten bleiben diesem Mitarbeiter zugeordnet. Auch inaktive Mitarbeiter mit historischen Buchungen können ausgewählt werden. Anlass ist [Discussion #37](https://github.com/patrickschiller/openclockwork/discussions/37).

## Rechtlicher Rahmen in Deutschland

Nach dem [Beschluss des Bundesarbeitsgerichts vom 13. September 2022, 1 ABR 22/21](https://www.bundesarbeitsgericht.de/entscheidung/1-abr-22-21/) müssen Arbeitgeber ein System zur Erfassung der Arbeitszeit vorhalten. Das [BMAS erläutert](https://www.bmas.de/DE/Arbeit/Arbeitsrecht/Arbeitnehmerrechte/Regelungen-zur-Arbeitszeit/Fragen-und-Antworten/faq-arbeitszeiterfassung.html), dass grundsätzlich die gesamte tägliche Arbeitszeit mit Beginn, Ende und Dauer aufzuzeichnen ist und derzeit keine allgemeine Formvorschrift besteht. Für diese Nachweise gibt es somit kein allgemein vorgeschriebenes PDF-Layout und keine allgemeine Pflicht zum PDF-Export.

Arbeitszeit umfasst nach [§ 2 Abs. 1 ArbZG](https://www.gesetze-im-internet.de/arbzg/__2.html) die Zeit vom Beginn bis zum Ende der Arbeit ohne Ruhepausen. Die [BMAS-Hinweise zur Mindestlohndokumentation](https://www.bmas.de/DE/Arbeit/Arbeitsrecht/Mindestlohn/Dokumentationspflicht/dokumentationspflicht.html) bestätigen, dass Unterschriften von Arbeitgeber oder Arbeitnehmer dafür nicht erforderlich sind und die konkrete Lage der Pausen nicht aufgezeichnet werden muss. Ein Unterschriftsfeld oder eine digitale Signatur ist daher keine Voraussetzung dieses Exports.

[§ 16 Abs. 2 ArbZG](https://www.gesetze-im-internet.de/arbzg/__16.html) verlangt die Aufzeichnung der über die werktägliche Arbeitszeit nach § 3 Satz 1 hinausgehenden Arbeitszeit und mindestens zwei Jahre Aufbewahrung dieser Nachweise. Zusätzlich verpflichtet [§ 17 Abs. 1 MiLoG](https://www.gesetze-im-internet.de/milog/__17.html) Arbeitgeber im dort genannten Anwendungsbereich, insbesondere bei geringfügiger Beschäftigung und bestimmten Branchen, Beginn, Ende und Dauer spätestens bis zum Ablauf des siebten folgenden Kalendertages aufzuzeichnen und die Aufzeichnungen mindestens zwei Jahre aufzubewahren. Haushalts-Minijobs nach § 8a SGB IV sind dort ausgenommen; weitere gesetzliche oder verordnete Ausnahmen können gelten. Die Sieben-Tage-Frist ist keine allgemeine Frist für alle Arbeitsverhältnisse. § 17 Abs. 2 MiLoG enthält außerdem Anforderungen an die Bereithaltung in deutscher Sprache.

Diese Quellen schreiben weder PDF/A noch eine Zertifizierung des Exports vor. Ein PDF allein erfüllt nicht sämtliche Pflichten des Arbeitgebers: Die zugrunde liegende Erfassung muss vollständig, richtig, zugänglich und ordnungsgemäß aufbewahrt sein. Branchenspezifische Regelungen und betriebliche Vereinbarungen sind gesondert zu berücksichtigen. Die Quellen wurden am 22. Oktober 2026 geprüft.

## Inhalt und Auswahl des Exports

Der Nachweis enthält:

- Name und Personalnummer, gewählten Zeitraum, Exportzeitpunkt sowie die konfigurierte IANA-Zeitzone der Installation.
- Vollständige Start- und Enddaten mit Uhrzeiten und UTC-Offsets, damit auch Nachtarbeit und Zeitumstellungen nachvollziehbar bleiben.
- Bruttodauer, nach der konfigurierten Regel abgezogene Pausen und resultierende Nettoarbeitszeit je Buchung sowie den Buchungsstatus.
- Tages- und Zeitraumssummen. Die Zuordnung zum Buchungstag richtet sich nach dem Arbeitsbeginn: Eine Schicht über Mitternacht bleibt vollständig beim Starttag und wird nicht in Kalendertage aufgeteilt. Die Tageswerte sind daher Buchungstagssummen, keine auf Mitternacht getrennten gesetzlichen Tagesprüfungen.

Nur abgeschlossene Buchungen gehen in die Summen ein. Abgelehnte und stornierte Buchungen werden ausgeschlossen. Noch nicht genehmigte, abgeschlossene Buchungen bleiben mit ihrem Status sichtbar; ihre Werte sind vorläufig. Offene Buchungen werden nicht hochgerechnet; der Nachweis weist auf ihre Anzahl hin. Ein leerer Zeitraum ersetzt keinen Nachweis, dass tatsächlich keine Arbeit geleistet wurde.

Die Pausenwerte bilden regelbasierte Abzüge aus den gespeicherten Regel-Snapshots ab. Automatische Abzüge belegen nicht, dass Pausen tatsächlich genommen wurden; tatsächliche Pausenlagen werden nicht dokumentiert. Der Arbeitgeber muss die zutreffende Erfassung und die Einhaltung der Pausenregeln sicherstellen. Im PDF werden Brutto und Netto auf Sekunden gerundet und der angezeigte Pausenabzug als Differenz daraus gebildet. Tages- und Zeitraumssummen addieren diese angezeigten Werte.

## Berechtigung und Grenzen

Der Download ist auf HR-Berechtigte und die berechtigte Organisation beschränkt. Ein Sammel-PDF enthält personenbezogene Arbeitszeitdaten mehrerer Mitarbeiter und muss entsprechend geschützt und gezielt weitergegeben werden. Standorte, Freitextnotizen und Projekte werden nicht exportiert.

Der PDF-Export unterstützt die Arbeitszeitdokumentation und ist keine Bescheinigung allgemeiner Rechtskonformität. Er ist insbesondere keine vollständige Lohnabrechnung: Abwesenheiten, Vergütung und eine vollständige Überstundenabrechnung sind nicht Bestandteil dieses Nachweises. Der Download ersetzt weder das Erfassungssystem noch eine Aufbewahrungsstrategie. Die Verantwortung für Richtigkeit, Vollständigkeit, zulässige Verarbeitung und erforderliche Aufbewahrung verbleibt beim Arbeitgeber.
