# Bonkproof-Projektformat V1

Eine Projektdatei ist UTF-8-JSON mit der Endung `.bonkproof.json`. Sie enthält den Planungsstand und kann GPX- und andere Standortdaten enthalten. Der Projektdateiexport steht neben den bestehenden GPX-, TCX- und TrackKin-Ausgaben.

## Dokument und Zustand

| Feld | Inhalt |
| --- | --- |
| `format`, `schemaVersion` | Kennung `bonkproof-project` und Ganzzahl `1`. Versionsnummer des portablen Dokuments. |
| `id`, `name` | 32 hexadezimale Zeichen aus 128 Zufallsbits und ein Name mit 1–120 Zeichen. Speichern und Umbenennen behalten die ID. Duplikate und Importkopien bekommen neue IDs. |
| `createdAt`, `updatedAt` | ISO-8601-Zeitstempel in UTC mit Millisekunden. |
| `state.route` | `null` für ein Projekt ohne GPX, sonst `{fileName, gpx}` mit ursprünglichem Dateinamen und vollständigem GPX-Text. |
| `state.projectionVersion` | `1` bezeichnet den aktuellen Algorithmus für GPX-Kanten und Passagen. |
| `state.global` | Aktive Kategorien in `enabled`, Radien in `radii`, vollständige Radiusabdeckung pro Kategorie in `loadedRadii`. Radienlisten enthalten Paare `[Kategorie-ID, Meter]`. `coverage` ist `unsearched`, `complete` oder `incomplete`. |
| `state.scopes` | Abschnittsobjekte mit `start`, `end` in Metern ab Routenbeginn, `enabled` und `radii`. Der Abschnittsschlüssel wird als `start/end` aus beiden Zahlen gebildet. Eine spätere Suche kann die Konfiguration ändern, während früher übernommene Treffer erhalten bleiben. |
| `state.pois`, `state.accepted` | Snapshots der aktuell verfügbaren POI-Vorbeifahrten und separater Bestand für ausdrücklich übernommene Nachsuchtreffer. Letztere enthalten in `scopeKey` den Abschnitt, aus dem die aktuelle Übernahme stammt. Eine Vorbeifahrt kann in beiden Beständen stehen. |
| `state.selected`, `state.pins` | Referenzen auf konkrete Vorbeifahrten im Bestand. Für erhaltene Alt-Treffer bleibt der jeweilige Snapshot verfügbar. |
| `state.gaps`, `state.resupply` | Critical-Referenzdistanz in Kilometern, die drei Warnungsprozentsätze und die Liste zuverlässiger Versorgungskategorien. |
| `state.exportOptions` | Zielprofil, Format und Auswahl für zusätzliche Warnpunkte beim Routenexport. |

Ein POI-Snapshot enthält Provider-Typ und Quellen-ID (`osmType`, `osmId`), den Passageanker `passId` als `edge-N`, laufende Passage-Nummer und Anzahl, Ortskoordinaten, Name, Tags sowie Kategorie-ID, Label, Gruppe und Standardradius. `routeKm` bezeichnet die Routenposition und `offRouteM` die Entfernung zur Route. `status` hat einen der Werte `match`, `near-miss`, `pinned` oder `retained`. `scoped` und `scopeKey` kennzeichnen übernommene Abschnittstreffer. Schlüssel für ausgewählte Stopps und Pins haben die Form `osmType/osmId#edge-N`. Eine gemeinsame Quellen-ID kann mehrere Passagen haben.

Bonkproof liest die Routenpunkte, Streckenkilometer und Paketgrenzen aus dem GPX-Text. Es berechnet Routebook, Warnungen und Exportansichten aus den Snapshots und Einstellungen. Projektionsergebnisse gehören zu den Eingabedaten der Wiederherstellung, weil externe Quellen sich zwischen Suchen ändern können. Ausstehende Requests, ungeprüfte Nachsuchtreffer, ICE-Aktivierung, Kartenansicht, Tab, Pagination und Aufklappzustände sind flüchtig. Bei einer gespeicherten unvollständigen Suche sind die verfügbaren Treffer und der Prüfstatus erhalten. Eine spätere ausdrücklich gestartete Suche beginnt mit aktuellen Suchpaketen.

## Validierung und Migration

`project-format.js` stellt `createProject`, `snapshotProjectPoi` und `validateProject` bereit. Die Validierung prüft Identität und Version, Pflichtfelder, Wertebereiche und Referenzen sowie GPX-Geometrie und die Position jeder Passage auf ihrer Kante. Projektnamen und POI-Texte werden als Nutzerdaten behandelt. Der Import weist fehlerhaftes UTF-8, unbekannte Objektfelder und GPX-Dokumenttyp-Deklarationen ab. Neue Felder gehören zu einer ausdrücklich unterstützten Schema-Version. Der Dateidialog akzeptiert Projektdateien bis 128 MiB, der GPX-Text bis 32 Mi UTF-16-Codeeinheiten und je POI-Liste bis 250.000 Einträge. Das Speicherlimit des Browsers kann früher erreicht sein.

Die transportierte Schema-Version und die Datenbankversion sind unabhängig. Für ein zukünftiges Schema vor der Zielvalidierung einen expliziten Konverter pro bekannter Ausgangsversion einsetzen. Neue Felder mit dokumentierten Standardwerten versehen. Wenn die Projektion sich ändert, die ursprüngliche GPX-Route und gespeicherten Passagen verwenden, um Referenzen nachvollziehbar zu migrieren. Die Zuordnung einer Auswahl oder eines Pins an einer mehrfach passierten Stelle muss entlang der Fahrreihenfolge überprüft werden. Bei nicht eindeutiger Zuordnung bleibt der ursprüngliche Export als Rückgriff verfügbar. V1 lehnt unbekannte Schema- und Projektionsversionen ab.

## Lokale Speicherung und Anschlussstellen

`createProjectStore()` kapselt IndexedDB. `list()` liest Metadaten, `get(id)` liefert Dokument und lokale Revision. `save(project, expectedRevision)` und `remove(id, expectedRevision)` vergleichen die Revision innerhalb derselben Schreibtransaktion. Ein fehlender erwarteter Revisionswert beim Speichern verlangt eine freie Projekt-ID. Projektinhalt und Listenmetadaten werden gemeinsam festgeschrieben und beim Lesen auf übereinstimmende Revision geprüft. Bei Schreibvorgängen wird strengere Dauerhaftigkeit angefordert, sofern der Browser sie unterstützt. Die UI meldet Erfolg erst nach dem Transaktionsabschluss. Revisionskonflikte lassen die offene Planung erhalten, die als Duplikat gesichert oder als Datei exportiert werden kann. Ein importiertes Dokument mit kollidierender ID wird als separates Projekt gespeichert.

`mountProjectWorkspace` verbindet Speicherung, Entwurfszustand und Oberfläche über `capture`, `verify`, `prepare` und `apply`. Nach der ersten manuellen Speicherung oder einem Import werden Änderungen mit einer Ruhezeit von 1,2 Sekunden zusammengefasst. Globale Suchen blockieren das Schreiben eines noch unvollständigen Zwischenzustands. Die Oberfläche zeigt laufende und fehlgeschlagene Speicherung an. Ein Öffnen verwirft laufende Anfragen der vorherigen Route und stellt den Zielstand wieder her. Der zuletzt aktive Projektbezug wird in Session Storage pro Tab gemerkt. Speicherzugriff kann browserseitig eingeschränkt sein. Beim Verlassen des Tabs kann der Browser vor offenen Änderungen warnen. Eine ausstehende Speicherung beim Beenden oder bei einem Absturz ist technisch nicht garantiert. Eine portable Projektdatei bleibt als Rückgriff verfügbar.

Für Phase E ist der Projektstore die Schnittstelle zum gespeicherten Planungsstand. Der [PWA-Cache](pwa.md) liefert den Offline-Start und hält Anwendungsressourcen getrennt von Projekt- und Nutzerdaten. Kartenkacheln bleiben online. Für Phase F sind Dokument-ID, Schema-Version, Änderungszeit und validierbare Snapshots die Schnittstelle. Die lokale Revisionsprüfung koordiniert Tabs desselben Origins. Eine spätere Synchronisierung benötigt eigene Serverrevisionen und Konfliktregeln.

## Lokaler Browsertest

Mit verfügbarer Playwright-Installation und dem Playwright-Chromium `node tests/project-browser-check.cjs` ausführen. Alternativ zeigt `CHROMIUM_EXECUTABLE` auf installiertes Chromium. Der Test fängt alle Anfragen ab, verwendet synthetische GPX- und POI-Daten und prüft die echte IndexedDB des Testbrowsers.

Synthetische Leistungsmessung mit `BENCHMARK_REPEATS=3 node tests/project-benchmark.cjs`. Ergebnisse und Messgrenzen stehen im [Projektstatus](PROJECT_STATUS.md).
