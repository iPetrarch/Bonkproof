# Bonkproof als mobile Local-first-PWA

Bonkproof verwendet den gespeicherten Projektstand als Grundlage für die Planung unterwegs. Die Oberfläche ist für die Bedienung während eines Halts vorgesehen.

## Nutzung und Grenzen

Beim ersten Online-Aufruf die Anzeige **Offline-Anwendung verfügbar** abwarten. In Safari auf dem iPhone über **Teilen → Zum Home-Bildschirm** installieren. Andere unterstützte Browser bieten eine Installationsschaltfläche oder einen Menüeintrag. Das Manifest verwendet die relative Startadresse und den relativen Scope. Die App hat lokale Symbole für den Homescreen, Standalone-Darstellung und Abstände für iOS-Safe-Areas.

Offline verfügbar sind gespeicherte Projekte mit GPX, POIs und Vorbeifahrten, Stopps, Pins, Abschnittsergebnissen, Warnungseinstellungen und Routebook. Projektdateien lassen sich importieren und exportieren. GPX-, TCX- und TrackKin-Ausgaben werden lokal erstellt. Bei Neustart im selben Tab versucht Bonkproof das zuletzt geöffnete Projekt wiederherzustellen. Nach einem vollständigen Prozess- oder Sitzungswechsel lässt sich ein vorhandenes Projekt aus der lokalen Liste öffnen.

Die Hintergrundkarte nutzt Online-Kacheln. Ohne Kacheln zeigt die App Route und gespeicherte POIs auf einem neutralen Raster. Die [OSM-Rasterkachelrichtlinie](https://operations.osmfoundation.org/policies/tiles/) untersagt Vorab-Abruf und Offline-Nutzung dieses Dienstes. Der Service Worker speichert deshalb keine Kacheln. Neue POI- und Abschnittssuchen brauchen eine erreichbare Providerverbindung. Die Online-Anzeige folgt dem Browser und garantiert keine Providererreichbarkeit. Fehlgeschlagene Anfragen nehmen den vorhandenen Treffern, Pins und Stopps ihre Verfügbarkeit nicht. Es gibt keine regelmäßigen Verbindungstests, Navigation oder Hintergrundortung.

Gespeicherte Projekte liegen in IndexedDB. Der Browser kann optional dauerhaften Speicher gewähren. Die Gewährung bietet keine Garantie gegen Datenlöschung oder Speicherfehler. Eine portable Projektdatei außerhalb des Browsers bleibt das Backup der Nutzerdaten.

## Anwendungsstart und Updates

- `manifest.json` und `sw.js` verwenden Pfade relativ zur App. Die Registrierung erfolgt aus `pwa.js` ohne einen globalen Scope für den Host.
- `scripts/update-app-shell.mjs` erzeugt die SHA-256-Tabelle aus den statischen Release-Dateien. Die Cache-Version enthält den Worker-Code und die Prüfsummen. Der Worker lädt eine neue Version unter ihrem eigenen Cache-Namen, prüft MIME-Typen und Bytes und markiert den Cache erst nach vollständigem Aufbau.
- Die installierte Version dient aus ihrem Cache. Eine fehlende Ressource kann online nur mit den passenden Bytes derselben Version repariert werden. Bei einer fehlgeschlagenen Installation bleibt die alte Version verwendbar. Eine neue Installation kann danach erneut vorbereitet werden.
- Der Worker behandelt nur bekannte statische Dateien und Navigation zur App im eigenen Scope. API-Aufrufe, Kartenkacheln, Projektdateien und IndexedDB bleiben getrennt.
- Ein wartendes Update wird in der Oberfläche angezeigt. Die manuelle Aktivierung erfordert einen gespeicherten Stand, abgeschlossene Suchvorgänge und ein einzelnes Bonkproof-Fenster im Scope. Sind mehrere geöffnet, bietet die App an, die anderen zu schließen. Die Seite prüft vor dem ausdrücklich angeforderten Neustart den Zustand erneut. Bei Änderungen während der Aktivierung kann der Nutzer erst speichern und dann neu laden. Der Browser aktiviert einen wartenden Worker auch regulär, wenn Nutzungsfenster der alten Version geschlossen sind.
- Bei Aktivierung entfernt der Worker ältere Anwendungscaches desselben Scope. Der Code löscht keine Projekte und lässt andere Scopes in Ruhe. Cache und Datenformatschema sind getrennt versioniert. Änderungen an einem Projektschema erfordern eine eigene Kompatibilitäts- und Migrationsprüfung.

## Release und Hosting

HTTPS und die App-Adresse mit abschließendem Slash verwenden, beispielsweise `/bonkproof/`. `sw.js` unmittelbar in diesem Verzeichnis unter JavaScript-MIME bereitstellen. Relative Pfade brauchen keinen erweiterten Service-Worker-Scope. `manifest.json` mit `application/json` oder `application/manifest+json` senden. Module brauchen JavaScript-MIME, CSS `text/css`, HTML `text/html`, Symbole `image/png`. Der Server darf die komprimierten Transportbytes ändern, der dekomprimierte Anwendungsinhalt muss zur Prüfsumme passen.

Bei Änderungen an statischen Dateien `node scripts/update-app-shell.mjs` ausführen. `npm test`, der zentrale Manifestgenerator und das lokale PowerShell-Skript prüfen die Konsistenz. Die Release-Wege verwenden die eingecheckten Leaflet-Dateien. npm liefert CSS und Lizenz mit abweichenden Zeilenenden, die der Prüfsummenprüfung dieses Release nicht entsprechen. In der Übertragungsreihenfolge den Worker zuletzt veröffentlichen. Bei kurzfristig gemischten Dateien kann eine Installation fehlschlagen und nach Abschluss des Uploads erneut versucht werden. Das Hosting selbst und seine MIME-Konfiguration müssen bei der späteren Abnahme geprüft werden.

## Reproduzierbare Tests

- `npm test` und `node tests/central-sftp-manifest-test.mjs`.
- `CHROMIUM_EXECUTABLE=/usr/bin/chromium LARGE_PROJECTS=1 node tests/pwa-browser-check.cjs` unter Linux mit Playwright. `BROWSER_ENGINE=webkit node tests/pwa-browser-check.cjs` verwendet das Playwright-WebKit mit seiner lokalen Laufzeit.
- `CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/project-browser-check.cjs` für Projektspeicher, Tabkonflikte sowie Transaktions- und Speicherfehler.
- Die Browser-Tests verwenden simulierte Provider und ein temporäres HTTP-Hosting im Unterpfad. Die kontrollierten Versionen injizieren einen abweichenden Ressourceninhalt. Im isolierten Linux-WebKit WPE wird der lokale Testserver abgeschaltet und der Offline-Status für die UI simuliert. Der Playwright-Offline-Schalter bricht in dieser Umgebung die Navigation vor der Worker-Antwort ab. Die Prüfung ist keine iPhone-Abnahme. Der simulierte Fehler externer POI-Provider wird in Chromium geprüft, da die abgefangenen WebKit-Anfragen im Test unzuverlässig abbrechen.

## Abnahmecheckliste für die spätere Freigabe

| Schritt | Erwartetes Ergebnis |
| --- | --- |
| GitHub CI am freigegebenen Commit | `npm test`, Python-Prüfung und Manifesttest laufen grün. `node scripts/update-app-shell.mjs --check` ist reproduzierbar und der Checkout bleibt sauber. |
| SFTP-Release in Testinstanz | Alle Listen stimmen überein. HTTPS, Unterpfad, Worker-Scope und MIME-Typen passen. Worker zuletzt bereitstellen und einen frischen Client bis „Offline-Anwendung verfügbar“ prüfen. |
| Live-Provider mit realer 600-km-GPX | Overture und vorhandenen Overpass-Fallback mit zulässigem Suchumfang prüfen. Globale und gezielte Nachsuche liefern plausible Kilometer. Mehrfachpassagen, Pins und Stopps bleiben bei Providerfehlern oder verspäteten Antworten erhalten. |
| Installation auf einem echten iPhone | In Safari zum Homescreen hinzufügen. App-Name, Symbol, Standalone-Ansicht, Safe-Areas im Hoch- und Querformat sowie Touch-Ziele prüfen. |
| Flugmodus und vollständiger App-Neustart | Nach bestätigter Vorbereitung und Projektspeicherung App vollständig schließen, Flugmodus einschalten und über das Homescreen-Symbol neu starten. Projekt öffnen. Route und POIs erscheinen auch ohne Hintergrundkarte. |
| Offline-Bearbeitung und Speicherung | Stopp und Pin für die richtige Vorbeifahrt ändern, Warnungsschwelle bearbeiten, Routebook und Warnung prüfen. Nach „Gespeichert“ erneut vollständig öffnen und die Änderungen vergleichen. |
| Backup und Wiederherstellung | Projektdatei lokal exportieren, in einem separaten Browserprofil oder Testgerät importieren und Stopps, Pins und Abschnittsergebnisse vergleichen. Bei kollidierender ID bleibt das bestehende Projekt erhalten. |
| VoiceOver und Tastatur | Online-/Offline- und Speicherzustände, Klappabschnitte, Fokuswechsel zu Warnungen, POI-Auswahl und Updatebutton sind erreichbar und verständlich. |
| GPX, TCX und TrackKin | Aus einem gespeicherten Projekt exportieren und auf den vorgesehenen Zielgeräten bzw. im TrackKin-Import prüfen. Mehrfachpassagen und erwartete Warnpunkte vergleichen. |
| Update einer installierten PWA | Mit separaten alten und neuen Releases beginnen. Update bei offenem Entwurf und mehreren Tabs prüfen. Danach ausdrücklich aktivieren, Projekt wie gespeichert öffnen und einen erneuten Offline-Start durchführen. Bei absichtlich unvollständigem Release bleibt Version 1 verfügbar. |

Phase F und die Synchronisierung zwischen Geräten bleiben außerhalb dieses Release-Kandidaten.
