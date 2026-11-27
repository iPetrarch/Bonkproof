# Bonkproof · Projektstatus

Stand 27. November 2026. Lokale Bearbeitung von [Issue #61](https://github.com/iPetrarch/Bonkproof/issues/61) auf `main` bei `7b374c4`. Entwicklungsphasen A–E sind als lokaler Release-Kandidat umgesetzt und geprüft. Die bisherigen Phasen und ihr Review sind nachfolgend dokumentiert.

## A · Architektur-Audit

| Bereich | Vorhandene Architektur |
| --- | --- |
| GPX und Ansicht | `app.js` liest die GPX-Datei im Browser und verwaltet Originaltext, Dateiname, getrennte Tracksegmente und kumulierte Streckenlänge. Leaflet rendert Route, POIs und Warnungen in getrennten Layern. |
| Globale POI-Suche | `poi-config.js` liest die datengetriebenen Kategorien, Suchradien und Toleranzbereiche. `poi-search.js` paketiert die Route mit Überlappung und unterstützt Wiederholungen und Paketaufteilung. `app.js` lädt fehlende Kategorien oder größere Radien gezielt nach. Der Cache für globale Radiusabdeckung und ICE-Zustand ist flüchtig. |
| Provider | `poi-provider-overture.js` verwendet bei unterstützten Abfragen zuerst `api/places.php` mit der serverseitigen SQLite/RTree-Datenbank. Fehlende oder nicht unterstützte lokale Antworten fallen auf den bestehenden Overpass-Client zurück. Der Browser verarbeitet beide Datenquellen in einem gemeinsamen Kandidatenformat. |
| Identität | Die physische Identität stammt aus Provider-Typ und Quellen-ID. `poi-projection.js` ermittelt Vorbeifahrten in der Reihenfolge der GPX-Geometrie. `poiKey` kombiniert physische Identität und Vorbeifahrt. `poi-pass-index.js` gruppiert Vorbeifahrten für die Navigation. |
| Warnungen, Routebook und Export | `routebook.js` berechnet Lücken auf Basis gefundener Versorgungspunkte oder ausgewählter Stopps. `resupply-profile.js` qualifiziert dafür derzeit Supermärkte, Tankstellen und Trinkwasser. `export-model.js` und die Exportmodule erzeugen lokale Dateien. Der TrackKin-Handoff ist ein eigener Exportvertrag. |

Die beiden Entwicklungsbranches `origin/feat/collapsible-poi-workspace` und `origin/feature/collapsible-workspace-sections` enthalten jeweils zwei Commits für native Aufklappbereiche in `index.html` und `styles.css`. Der Ansatz wurde auf dem aktuellen Stand übernommen und um Warnungszahlen, Routebook und Einstellungen erweitert.

Für das Audit wurden README, Roadmap, UI- und POI-Dokumentation, lokale Overture-Dokumentation sowie Test- und Release-Workflows geprüft. Weiter offen sind die Produktivmessung (#53), der reale GPX/TCX-Exporttest (#46), der TrackKin-Vertrag (#40), FIT Course Points (#36) und die übergreifende Exportarchitektur (#6).

## B · Arbeitsbereiche

Kategorien und Radien, Long-Distance-Warnungen, gefundene POIs mit Pagination, Routebook und Warnungseinstellungen haben unabhängige native `details`-Elemente. Der Browser behält den Aufklappzustand bei Neuberechnungen und Tabwechseln, da nur die Inhalte aktualisiert werden. Die Zusammenfassungen nennen Warnungszahlen nach Schweregrad. Bei laufender oder unvollständiger globaler POI-Suche zeigt die Warnungsübersicht den Prüfstatus.

## C · Nachsuche

Unter **Long-Distance-Warnungen → Hier nachsuchen** lässt sich eine berechnete Versorgungslücke auswählen. Je Lücke gibt es eigene Kategorien und Radien. Erst **Nachsuche starten** sendet Suchpakete. Die Suchrahmen werden an den Lückengrenzen interpoliert, in Pakete von höchstens 20 Streckenkilometern unterteilt und um den jeweiligen Suchradius samt Toleranz erweitert. Getrennte GPX-Tracksegmente erhalten getrennte Suchrahmen.

Kandidaten werden auf die vollständige Route projiziert. Übernehmbar sind Vorbeifahrten innerhalb der ausgewählten Lücke. Die Passage-ID verweist auf die Kante des lokalen Distanzminimums in der unveränderten Route und bleibt bei anderem Suchradius gleich. Die angezeigte laufende Nummer ist vom jeweiligen Suchradius abhängig. Damit werden doppelte Antworten zu derselben Vorbeifahrt zusammengeführt und wiederholte Passagen derselben Einrichtung erhalten. Overture- und OSM-IDs werden als separate Quellenidentitäten gehandhabt. Für eine quellenübergreifende Zuordnung fehlen belastbare gemeinsame IDs.

Abgebrochene, fehlgeschlagene und als unvollständig gemeldete Pakete sind im Suchstatus erkennbar. Bereits erhaltene Treffer bleiben nach einem Abbruch oder Teilerfolg zur Prüfung verfügbar. Die lokale Obergrenze von 5.000 Rohdatensätzen wird vorsorglich als möglicherweise unvollständige Antwort angezeigt. Übernommene Treffer bleiben bei späteren globalen Suchen verfügbar. Sie wirken entsprechend der bestehenden Versorgungsqualifikation auf die Gefunden-Warnungen. Für Routebook-Lücken zählen wie bisher die gezielt als Stopps ausgewählten Vorbeifahrten. Pins bleiben separat. Die Datenschutzerklärung nennt die Suchrahmen der Nachsuche und die schon verwendeten Provider.

## D · Architekturgrundlage aus A–C

| Zustand | Später zu speichern oder abzuleiten |
| --- | --- |
| Projekt und GPX | Schema-Version, Projekt-ID, Original-GPX mit Name und Tracksegmenten, Routenfingerabdruck und Version des Projektionsverfahrens. Kumulative Länge und Kartenlayer aus der Geometrie ableiten. |
| Globale und lokale Suche | Globale Kategorie-IDs und Radien, Version der Kategorie-Konfiguration und pro Abschnitt Start-/Endmeter auf der konkreten GPX-Version, lokale Kategorie-IDs und Radien. ICE als temporäres Overlay behandeln. |
| Suchergebnisse | Physische POIs mit Quellen-ID, Koordinaten und benötigten Tags. Vorbeifahrten separat mit Route, Passage-ID, Routenmetern, seitlichem Abstand und Match-Status speichern. Bei gespeicherten Suchergebnissen Provider, Zeitpunkt, Suchabdeckung und Vollständigkeit mitführen. |
| Auswahl und Pins | Referenzen auf die konkrete Vorbeifahrt und Snapshots für die Offline-Anzeige. Übernommene Ergebnisse und ihre Abschnittszuordnung getrennt von noch ungeprüften Ergebnissen halten. |
| Warnungen und Routebook | Warnungseinstellungen und Version des Versorgungsprofils speichern. Routebook, Warnungen und Export aus Route, Suchbestand und Auswahl reproduzierbar ableiten. Ein zukünftiger optionaler Snapshot braucht eine Berechnungsversion. |

Am Ende von Phase C lag der Projektzustand im Arbeitsspeicher des laufenden Tabs. Die Planungsfunktionen in den ES-Modulen sind unabhängig von einem Speichermedium. Für ein versioniertes Projektformat bieten sich explizite Serialisierung und Validierung zwischen Anwendungszustand und Speicheradapter an. Die Schlüsselstrategie braucht Versionsinformationen und eine Migrationsregel, falls sich Route oder Projektion bei einem späteren Import ändern. Der TrackKin-Handoff enthält dafür nur die Teilmenge, die sein eigener Vertrag benötigt. Phase D ergänzt lokale Speicherung und Import. Offline-Start und Synchronisierung sind Gegenstand späterer Phasen.

## Verifikation

- Ausgangsstand `7b374c4` in Codex Cloud mit Node 24.22.3 geprüft. `npm test` war vor Änderungen in 23 Testdateien erfolgreich. Die zusätzliche Ausführung ohne Testisolation meldete 158 bestandene Einzeltests.
- Abschlussprüfung erfolgreich mit `npm test` in 24 Testdateien, 165 bestandenen Einzeltests ohne Testisolation, zentralem SFTP-Manifesttest und `py_compile` für beide Python-Wartungsskripte. Die PHP-Laufzeit und eine lokale Overture-Datenbank standen für einen Live-Provider-Test nicht zur Verfügung.
- Die hinzugefügten Einzeltests decken Begrenzung der Suchgeometrie, getrennte GPX-Segmente, stabile Vorbeifahrt-Schlüssel bei Selbstkreuzung und identischer Hin- und Rückfahrt, Überlappung, nahe POIs, Pins, Auswahl, Teilantworten, Fehler und Abbruch ab.

- Chromium in Codex Cloud wurde mit 1.440 und 390 Pixel breiten Ansichten, synthetischer Hin- und Rückroute und simulierten Providerantworten geprüft. Bestätigt sind Tastaturbedienung, unabhängige Aufklappzustände über Tabwechsel, Suchgrenzen und unveränderte globale Filter, Abbruch, Teilerfolg, gezielte Übernahme, Erhalt von Pin und Stopp, Neuberechnung der Warnungen, ICE-Umschaltung und GPX-Download.

### Offene manuelle Browserprüfungen

| Prüfung | Erwartung |
| --- | --- |
| iOS Safari und Screenreader, hoch und quer | Aufklappköpfe und Warnungszahlen sind erreichbar und verständlich. Fokus wechselt beim Öffnen der Nachsuche zur Überschrift. Die rechte Seitenleiste beziehungsweise das mobile Bedienfeld bleibt scrollbar. |
| Reale lange GPX und Live-Provider in einer Testinstanz | Nach Start der Nachsuche zeigt der Netzwerk-Tab Suchrahmen entlang der gewählten Lücke. Unterstützte Kategorien verwenden möglichst Overture, der vorhandene Overpass-Fallback bleibt funktionsfähig. Latenz und Antwortumfang separat erfassen (#53). |
| Karte und Gerätekette | Bei gleicher Straße in zwei Fahrtrichtungen beide Vorbeifahrten anhand der Streckenkilometer prüfen. Einen Treffer auswählen und pinnen, ICE ein- und ausschalten, Warnungen prüfen und GPX/TCX auf einem realen Zielgerät importieren (#46). |

## Unabhängiger Review von A–C · 27. November 2026

Geprüft wurde der uncommittete Stand auf `7b374c4`. Der Review begann mit Quellcode, Diff und dem vorhandenen Testlauf. Vor den Korrekturen liefen alle 24 Testdateien. Ein separater Chromium-Lauf mit kontrollierten Providerantworten reproduzierte trotzdem drei fachliche Fehler in beiden geprüften Ansichtsbreiten.

| Befund | Korrektur und Nachweis |
| --- | --- |
| Globale Warnungen verwendeten den Status des ursprünglichen Suchradius. Beim Verkleinern blieb ein außerhalb liegender Treffer als Versorgungspunkt in der Warnungsberechnung. | Globale Treffer werden mit dem aktuellen normalen Radius und aktiven Kategorien bewertet. Übernommene Abschnittstreffer qualifizieren sich separat mit ihrem Abschnittsstatus. Der Test prüft die resultierende Lückenlänge, einschließlich Near Miss, Pins, ausschließlich ausgewählter Alt-Treffer und deaktivierter globaler Kategorie. |
| Eine globale Aktualisierung konnte einen ausgewählten, aktuell nicht erneut gelieferten Stopp löschen. Ein Pin konnte beim Lösen zugleich die ausgewählte Vorbeifahrt entfernen. | Auswahl und Pins werden anhand der aktuellen Schlüssel mit Ergebnissen und früheren Treffern zusammengeführt. Alt-Treffer bleiben für die Auswahl bzw. Pins verfügbar. Ein neuer regulärer Treffer ersetzt seinen alten Eintrag. Routebook und Exportanzeige werden nach dem Abschluss neu gerendert. |
| Gekappte HTTP-200-Antworten galten global als vollständig und bestätigten Radiusabdeckung. Eine inkrementelle Suche konnte noch offene Kategorien aus einem gemischten fehlgeschlagenen Paket entfernen. | Antwortmarkierungen werden bei der globalen Suche berücksichtigt. Teilergebnisse bleiben sichtbar, Warnungen zur gefundenen Versorgung werden als unvollständig ausgewiesen und die Radiusabdeckung wird nur für tatsächlich vollständig abgefragte Kategorien aktualisiert. Wiederholungspakete berücksichtigen die aktivierten Kategorien. |
| Globale Suchrahmen konnten lange Kanten ohne Zwischenpunkte auslassen und getrennte GPX-Tracksegmente für die Distanzberechnung künstlich verbinden. | Paketgrenzen und adaptive Teilungen werden entlang der jeweiligen GPX-Kante interpoliert. Getrennte Tracksegmente werden einzeln abgefragt. Ein Regressionstest prüft die räumlichen und metrischen Grenzen aller Pakete und Teilpakete. |
| Während eines globalen Suchlaufs konnten weitere Änderungen an Kategorien oder Radien verloren gehen. Eine verspätete Antwort oder ein verspätetes Einlesen einer GPX-Datei konnte auf überholtem Zustand weiterarbeiten. | Weitere benötigte Kategorien werden nach Abschluss mit den aktuellen Einstellungen abgefragt. Ein Routenwechsel verwirft ausstehende Änderungen und alte Rückmeldungen. Der Overture-Bridge-Test prüft, dass vor einem abgebrochenen Start und nach einem abgebrochenen lokalen Versuch keine Overpass-Anfrage entsteht. Eine JSON-Antwort mit ungültiger lokaler Struktur meldet unvollständige Daten. |

### Aussagekraft der Tests

Die HTML-/Quellcode-Tests für Aufklappstruktur, CSS-Fokus, Handler und Modulverdrahtung bleiben Strukturprüfungen. Die fachlichen Tests rufen Projektions-, Suchpaket-, Provider-, Auswahl- und Warnungslogik mit konkreten Daten auf. Sie prüfen unter anderem Reihenfolge und Identität bei Selbstkreuzungen, identischen Hin- und Rückwegen und einer dreifachen Befahrung, veränderte Radien, nahe unabhängige POIs, Überlappung, Teilergebnisse und Abbruch. Ersetzte Quelltextprüfungen für die Sicherung von Pins werden durch den Ausführungstest für getrennte Passagenschlüssel und Auswahl-/Pin-Snapshots abgedeckt.

### Review-Teststatus und offene Prüfungen

- Erfolgreich in Codex Cloud ausgeführt wurden `npm test` mit 24 Testdateien, die Ausführung ohne Testisolation mit 170 Einzeltests, der zentrale SFTP-Manifesttest und `py_compile` für beide Python-Wartungsskripte.
- Chromium bei 320, 390 und 1.440 Pixeln mit lokalen Fixtures und simulierten Antworten prüfte Warnungen nach Änderungen am Cache-Radius, Teilantworten, den Erhalt von Routebook-Stopp und Pin, Tastaturbedienung, einen GPX-Wechsel während der Nachsuche, die Begrenzung auf eine der beiden Vorbeifahrten am selben Ort und nachgelagerte globale Radiusänderungen. Der abgefangene Netzwerkverkehr bestätigte die lokale Overture-Anfrage für die geprüften Kategorien sowie das Ausbleiben eines Fallbacks bei Abbruch.
- Derselbe reale Ort kann mit getrennten Overture- und OSM-IDs weiterhin doppelt erscheinen. Für die getestete Quellen-ID bleibt der Schlüssel bei unveränderter Geometrie und gleichen Providerkoordinaten stabil. Bei realen langen oder verrauschten GPX-Tracks bleibt zu prüfen, ob eng benachbarte Distanzminima im UI als getrennte Passagen sinnvoll sind.
- Reale Provider, iOS Safari, VoiceOver und Zielgeräte bleiben offen. In einer Testinstanz die vorhandenen Overpass-Fallbacks für nicht unterstützte Kategorien, mögliche permanente Providerkappung, Rate Limits bei überlappenden globalen und abschnittsbezogenen Läufen sowie den Import des ausgewählten Routebooks auf einem Zielgerät prüfen. Die Nachsuche verwendet weiterhin die in der Datenschutzerklärung beschriebenen Dienste.

## Phase D · Versionierte Projekte und lokale Speicherung

Die Projektverwaltung unterstützt neue Entwürfe, Öffnen, Speichern, Umbenennen, Duplizieren, bestätigtes Löschen und Import/Export vollständiger Projekte. Gespeicherte Projekte werden nach Änderungen automatisch gesichert. Die Ansicht zeigt ungespeicherte Änderungen, laufende Speicherung und Fehler. Ein Projektwechsel mit offenem Entwurf erfordert Bestätigung. Nach Neuladen kann derselbe Tab das zuletzt aktive lokale Projekt wiederherstellen. Beim Öffnen werden Route, POI-Bestand, ausgewählte Passagen, Pins und Abschnittsergebnisse aus dem gespeicherten Stand aufgebaut. Eine POI-Suche wird dabei nicht gestartet.

[Projektformat V1, Validierung, Migration und Schnittstellen](project-format.md) dokumentiert den Snapshot, seine Abgrenzung zu abgeleiteten Daten und die Anschlusspunkte für Phase E und F. IndexedDB speichert Projektdaten und Listenmetadaten atomar in derselben Transaktion. Optimistische Revisionen prüfen Änderungen und Löschungen zwischen Tabs. Bei gleicher Import-ID entsteht eine Kopie mit einer neuen ID. Speicherfehler lassen den aktuellen Entwurf geöffnet. Bei blockiertem oder ausgeschöpftem Speicher kann der Entwurf weiterhin als Projektdatei exportiert werden. Die Datenschutzerklärung beschreibt GPX- und Standortdaten im Browser, Löschung, die tabbezogene Projekt-ID und möglichen Datenverlust.

### Testnachweise in Codex Cloud

- Vor Änderungen liefen 170 Einzeltests in 24 Testdateien erfolgreich. Nach der Implementierung waren es 174 Einzeltests in 25 Testdateien. Der zentrale SFTP-Manifesttest, die Python-Syntaxprüfung und `git diff --check` waren erfolgreich.
- Ein reproduzierbarer Playwright-Test in Chromium bei 360 und 1.440 Pixeln verwendete synthetische GPX-Dateien, simulierte Providerantworten und die echte Browser-IndexedDB. Er prüfte vollständiges Neuladen ohne POI-Netzwerkabfrage, Mehrfachpassagen, Pins, Stopps, Abschnittsergebnisse und unveränderte Warnungen. Er prüfte außerdem die bisherigen GPX-, TCX- und TrackKin-Downloads, Autosave, Tabkonflikte, Rollback nach simuliertem Speicherplatzfehler, abgelehnten Versionsimport, Importkopien bei ID-Konflikt, bestätigtes Löschen und Projektwechsel mit laufender Anfrage. Ein separater Browserkontext mit gesperrter IndexedDB bestätigte die Fehlermeldung und den weiterhin möglichen Projektexport.
- Die Release-Dateilisten in `deploy.ps1` und im zentralen SFTP-Manifestgenerator enthalten die Projektmodule. Der vorhandene manuelle GitHub-Deployment-Workflow mit eigener Dateiliste blieb unberührt. Bei einer späteren Verwendung dieses Pfads muss seine Dateiliste die Projektmodule enthalten.

### Offene Prüfungen

- Auf einem echten iPhone Safari mit VoiceOver und im privaten Modus prüfen. Der zuletzt geöffnete lokale Stand soll nach einem erneuten Laden erscheinen, sofern der Browser den Speicher behält. Bei verweigertem Zugriff soll der Fehler sichtbar bleiben und der Dateiexport funktionieren.
- Mit einer realen großen GPX-Datei und umfangreichem POI-Bestand Laufzeit, Speicherverbrauch und tatsächliches Quota-Verhalten messen. Bei einem fehlgeschlagenen Schreibvorgang sollen der vorherige gespeicherte Stand und der offene Entwurf verfügbar bleiben.
- Die offenen Live-Provider- und Zielgeräteprüfungen aus A–C bleiben relevant. Start ohne Netzwerk, Service Worker und geräteübergreifende Synchronisierung sind spätere Phasen.

## Kritischer Review von Phase D · 27. November 2026

| Befund | Korrektur und Nachweis |
| --- | --- |
| Eine erneute Nachsuche mit anderen Kategorien im selben Abschnitt konnte bislang das Speichern und Exportieren verhindern. | Übernommene Vorbeifahrten bleiben dem Abschnitt und der ursprünglichen Übernahme zugeordnet. Die aktuelle Suchkonfiguration darf sich ändern. Der Roundtrip-Test erhält beide Zustände. |
| Formal akzeptierte Fremdfelder konnten unkontrollierte verschachtelte Daten in IndexedDB bringen. Ungültige UTF-8-Sequenzen wurden ersetzt. Widersprüchliche Exportoptionen oder Bestände konnten sich beim Öffnen unbemerkt ändern. | V1 prüft erlaubte Felder, Referenzen, zusammengeführten POI-Bestand und das Format des gewählten Exportziels. Der Import dekodiert UTF-8 strikt. Die Größenprüfungen greifen vor dem Lesen großer Projektdateien und auch beim direkten Öffnen einer GPX-Datei. Importierte Namen und POIs werden als Text behandelt. |
| Escape konnte eine bestehende Route entfernen und damit eine automatische Speicherung auslösen. Import, Duplizieren und Löschen zeigten während ihres Schreibvorgangs den bisherigen Status. | Das Entfernen einer gespeicherten Route per Escape verlangt Bestätigung. Schreibaktionen werden in der Projektansicht als laufend angezeigt und schützen offene Änderungen beim Verlassen, soweit der Browser den Hinweis zulässt. |
| Bei beschädigtem lokalen Datenbestand konnte eine fehlende Metadatenzeile eine belegte Projekt-ID als frei erscheinen lassen. | Der Store prüft Metadaten und Dokument beim Lesen in einer Transaktion. Neuanlage verwendet einen Insert mit Indexkonflikt, sodass verwaiste Daten erhalten bleiben. Schreibtransaktionen fordern strengere Dauerhaftigkeit an, sofern der Browser sie unterstützt. Erfolg gilt erst nach `complete`. |
| Sehr große Vorräte konnten bei der längsten Lücke die JavaScript-Argumentgrenze überschreiten. Das Öffnen baute globale Suchpakete auf, obwohl noch keine Suchanfrage vorgesehen war. | Warnungen und Routebook berechnen Längen ohne Argument-Spread. Ein Regressionstest verwendet 140.000 Vorbeifahrten. Globale Suchpakete werden erst bei einer Suche aufgebaut. |
| Die Release-Pfade enthielten unterschiedliche Dateien. | Der Workflow erhält die drei Projektmodule, den Vorbeifahrtindex und fünf Leaflet-Bilder. Die lokale PowerShell-Liste erhält dieselben Bilder. Das zentrale Manifest enthält bereits alle Dateien. Der Regressionstest vergleicht die drei Dateimengen und verfolgt lokale JavaScript-Imports ab `index.html`. Workflow-Trigger, Ziele, Zugangsdaten und Sicherheitsmechanismen blieben unverändert. |

### Synthetischer Benchmark in Codex Cloud

Chromium auf Linux, 1.440 Pixel Breite, synthetischer Track mit einem Punkt je 10 m und zehn POIs je Kilometer. Keine Live-Provider, keine externen Kartenanfragen. Drei frische Browserkontexte je Größe. Die Tabelle zeigt die Mediane nach den Korrekturen. MB bezeichnet Dezimal-MB. Millisekunden sind gerundet.

| Route · Punkte · POIs | JSON-Datei | JSON schreiben / lesen | Formatprüfung | IndexedDB schreiben / lesen | Öffnen bis UI | UI-Speichern | Längstes Timerintervall beim UI-Speichern | Verbleibender JS-Heap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 200 km · 20.001 · 2.000 | 1,60 MB | 5 / 3 ms | 13 ms | 10 / 6 ms | 253 ms | 29 ms | 14 ms | 5,3 MB |
| 600 km · 60.001 · 6.000 | 4,81 MB | 22 / 9 ms | 19 ms | 27 / 17 ms | 484 ms | 72 ms | 28 ms | 14,3 MB |
| 1.000 km · 100.001 · 10.000 | 8,02 MB | 24 / 21 ms | 43 ms | 52 / 31 ms | 756 ms | 110 ms | 51 ms | 25,4 MB |

Die isolierte Validierung erhält bereits geparste GPX-Geometrie. Das Öffnen umfasst IndexedDB, XML-Parsing, Validierung und Darstellung. UI-Speichern umfasst Snapshot, Prüfung, Transaktion und die Abschlussanzeige ohne die 1,2 Sekunden Verzögerung der automatischen Speicherung. Der 10-ms-Timer ist ein Indikator für belegte Zeit auf dem Hauptthread. Für 1.000 km lag sein größtes beobachtetes Intervall bei rund 68 ms. Die Heap-Differenz nach erzwungener GC erfasst weder Spitzenbelegung noch den vollständigen Renderer- oder IndexedDB-Verbrauch. Die erste Kontrollmessung vor den Änderungen ergab Öffnungszeiten von 376/577/823 ms und 6,8/18,5/30,8 MB verbleibenden JS-Heap. Diese Einzelmessung dient als Orientierung. Die Tests liefern keine iPhone-, Quota- oder Akkulaufzeitwerte.

### Verifikation und Voraussetzungen für Phase E

- Ausgangsstand 174 Einzeltests in 25 Dateien. Abschluss 178 Einzeltests in 26 Dateien, zentraler Manifesttest, Python-Syntaxprüfung und `git diff --check` erfolgreich.
- Chromium bei 360 und 1.440 Pixeln prüfte Roundtrip, Wiederherstellung ohne neue POI-Anfrage, Tastaturbedienung, schnelle Änderungen und Gruppierung der Autosaves, Tabkonflikt und Duplikat, Löschung mit offenem Entwurf, ungültiges UTF-8 und Schema, Quota-Rollback, Transaktionsabbruch nach erfolgreichem Request und anschließendes Neuladen. Ein künstlich verwaister Projektdatensatz blieb nach einem Insert-Konflikt erhalten. Projektwechsel wurden mit verzögerten globalen und abschnittsbezogenen Antworten geprüft. Die vorhandenen GPX-, TCX- und TrackKin-Downloads blieben nutzbar.
- Ein beim Verlassen noch nicht abgeschlossener Schreibvorgang kann verloren gehen. Der Browser kann den nativen Warnhinweis unterdrücken. Simulierte Abbrüche belegen den atomaren Rollback, keinen physischen Geräteausfall. Lokale Browserdaten können weiterhin durch Browser oder Geräteeinstellungen gelöscht werden.
- Auf echten iPhones bleiben Safari mit VoiceOver, privater Modus, Tab-Hintergrund und App-Abbruch, Speicherdruck sowie große reale und POI-reiche Projekte zu prüfen. Erwartet wird die Wiederherstellung des zuletzt bestätigten Snapshots oder ein klarer Speicherfehler mit weiter möglichem Dateiexport. Besonders POI-reiche Projekte und zahlreiche Lücken können trotz der Formatgrenzen den Hauptthread und den Speicher stark belasten.
- Phase E setzt geprüften statischen Offline-Start, eine Strategie für das Caching der Anwendungsressourcen und eine klare Anzeige der Offline-Verfügbarkeit externer Dienste voraus. Der Projektstore kann diese Schritte als unabhängige Datenquelle bedienen.

## Wiederaufnahme Phase E

Arbeitsstand auf `main` bei `7b374c457c375bfe331d6749c085eb2edcd7963d` geprüft. Die bestehenden A–E-Änderungen einschließlich ungetrackter PWA-, Test- und Projektdateien waren vorhanden. Vor weiteren Änderungen wurde `Bonkproof-wiederaufnahme.tar.gz` in den Cloud-Downloads erstellt, entpackt und gegen die enthaltenen Dateiprüfsummen geprüft. Das Archiv enthält den vollständigen Quellbaum, Basis-Commit, Git-Status und binären Diff der getrackten Änderungen. Lokale Konfiguration, Browserdaten und Testabhängigkeiten bleiben außen vor. Eine vom Workspace unabhängige Kopie entsteht durch Download. Die Wiederherstellung steht in `RESTORE.txt` im Archiv.

Beim Wiederanlauf bestanden 180 Einzeltests in 27 Dateien. Chromium und WebKit werden im HTTP-Test unter `/bonkproof/` geprüft. Die WebKit-Bibliotheken wurden in einem temporären Verzeichnis extrahiert, ohne Systempakete zu installieren.

## Phase E abgeschlossen · Gesamtreview A–E

[Mobile Local-first-PWA](pwa.md) beschreibt Bedienung, Offline-Grenzen, Datenschutz, Worker-Lebenszyklus und die Checkliste für CI, späteres Deployment, Live-Provider, iPhone und Zielgeräte. In der Anwendung bleiben gespeicherte Projekte, Route und POIs ohne Netz nutzbar. Die neutrale Ansicht ersetzt fehlende Hintergrundkacheln. Anwendungscaches enthalten nur verifizierte statische Release-Dateien. Die OSM-Rasterkachelrichtlinie wurde geprüft. Kacheln und Providerantworten bleiben außerhalb des Anwendungscaches.

- Der Review bestätigte den Erhalt der aktiven Version bei HTTP-Fehlern und bei einem gültigen HTTP-200 mit falschen Bytes. Die alte Version bleibt dabei verfügbar. Bei einer kontrollierten Aktualisierung bleiben IndexedDB und andere Cache-Scopes erhalten. Das Update blockiert offene Entwürfe und parallele Fenster. Anschließend startet die neue Version offline und stellt den gespeicherten Projektstand wieder her.
- Der Release-Review verglich die eingecheckten Leaflet-Dateien mit dem npm-Paket 1.9.4. CSS und Lizenz unterscheiden sich durch Zeilenenden. Der manuelle Workflow und PowerShell verwenden deshalb die eingecheckten Dateien. Der zentrale Manifestgenerator, der lokale Publisher und der GitHub-Testschritt prüfen den statischen Cache vor Veröffentlichung. Die Release-Listen stimmen überein. Trigger, Ziel, Berechtigungen und Zugangsdaten wurden nicht geändert. Es wurde kein Deployment oder GitHub-Workflow ausgeführt.
- `npm test` und die Einzeltestausführung melden 180 bestandene Tests in 27 Dateien. Der zentrale Manifesttest, Python-Syntaxprüfungen, Cache-Prüfsummen und `git diff --check` sind erfolgreich. Der Gesamtreview stützt sich außerdem auf bestehende Tests für GPX-Geometrie, Selbstkreuzungen, Mehrfachpassagen, stabile Schlüssel, Suchpakete, Warnungen, Routebook und Exporte.
- Chromium und Linux-WebKit WPE bei 360 und 1.440 Pixeln prüften Cache-Vorbereitung, Unterpfad, Offline-Neustart, Speicherung von Stopps und Pins, Warnungsschwellen, Projektimport und -export sowie GPX-, TCX- und TrackKin-Download. Beide prüften den kontrollierten Updatepfad. Chromium prüfte außerdem den Ausfall einer simulierten externen POI-Suche und die bisherigen Projektfehlerfälle einschließlich Quota, Tabkonflikt und Transaktionsabbruch. Die WebKit-Prüfung sperrt den lokalen Testserver und simuliert den UI-Offline-Zustand, weil dessen Playwright-Offline-Schalter die Hauptnavigation vor der Worker-Antwort abbricht.
- Die synthetischen Langstreckenprojekte mit 200, 600 und 1.000 km und 2.000, 6.000 und 10.000 POIs wurden in Chromium lokal gespeichert, offline geöffnet, bearbeitet, erneut gespeichert und exportiert. Der Projektexport erhielt die ursprüngliche GPX und den gesamten POI-Bestand.
- Offen bleiben tatsächliches Hosting mit MIME-Prüfung, GitHub CI, Live-Provider mit realer 600-km-GPX, die native iPhone-Installation mit vollständigem Neustart im Flugmodus, VoiceOver, Gerätespeichergrenzen und der Import auf realen Zielgeräten. Die Tests verwendeten simulierte Provider. Phase F bleibt zurückgestellt.

### Übergabe und Sicherungen

`Bonkproof-wiederaufnahme.tar.gz` und `Bonkproof-A-E-release-kandidat.tar.gz` liegen mit SHA-256-Dateien in den Cloud-Downloads. Der vollständige Quellbaum liegt je Archiv unter `source/`. Nach dem Download ist das Archiv unabhängig von der Codex-Umgebung wiederherstellbar. Zum Prüfen entpacken und aus `source/` heraus `sha256sum -c ../SHA256SUMS` und `npm test` ausführen. Für einen Checkout mit Historie zuerst den in `base-commit.txt` angegebenen Commit in einem separaten Klon auschecken, dann `source/` darüberkopieren und mit `status.txt` und `tracked.patch` vergleichen. Die Archive enthalten keine Browserprojekte, Zugangsdaten oder installierten Testabhängigkeiten.

## GitHub-Übergabe des Release-Kandidaten · 27. November 2026

Der Übergabezweig `feat/issue-61-local-first-pwa` basiert auf dem erneut abgeglichenen `origin/main` bei `7b374c457c375bfe331d6749c085eb2edcd7963d`. Der vollständige Implementierungsstand A–E einschließlich der zuvor ungetrackten Dateien wurde für einen Draft-PR gegen `main` zu [Issue #61](https://github.com/iPetrarch/Bonkproof/issues/61) aufgenommen. Vor der Übergabedokumentation war der Quellbaum bytegleich mit dem SHA-256-geprüften Release-Archiv. Im Commit-Bestand sind Anwendungscode, Dokumentation, öffentliche Symbole und reproduzierbare Tests enthalten. Lokale Konfigurationen, Zugangsdaten und erzeugte Testartefakte bleiben außerhalb des Commits.

Erneut erfolgreich waren 180 Einzeltests in 27 Dateien, SHA-256-Prüfung des Anwendungscaches, der zentrale SFTP-Manifesttest, die Python-Syntaxprüfung und Chromium bei 360 und 1.440 Pixeln. Chromium prüfte auch den Offline-Roundtrip der synthetischen Projekte mit 200, 600 und 1.000 km. Providerantworten waren simuliert. Linux-WebKit war bereits im Release-Review erfolgreich und wurde für diese Übergabe nicht erneut installiert.

Die [Abnahmecheckliste](pwa.md) gilt weiter. GitHub-PR-CI, produktives Hosting, Live-Provider mit einer 600-km-GPX, native iPhone-Installation und VoiceOver sowie der Import auf Zielgeräten sind getrennte Prüfschritte. Phase F bleibt zurückgestellt.
