# Zusammenarbeit { #collaboration }

Mehrere Personen bearbeiten dieselbe Datei gleichzeitig. Jeder Editor hat seine eigene Engine; was
eine Person tippt, erreicht die anderen als Engine-Änderungen, über ein Relay im Schreibzeug-Server.
Es gibt keinen Document Server: Das Relay spricht den Teil seines Protokolls, den `sdkjs` braucht,
so wie CryptPad dieselbe Engine ohne einen betreibt.

```
browser A: engine ──fake socket.io──▶ CollabChannel ──WebSocket /api/collab/:fileId──┐
                                                                                      ▼
browser B: engine ◀─fake socket.io─── CollabChannel ◀───────────────────── apps/server: hub ─▶ session
```

## Einer Sitzung beitreten { #joining-a-session }

Das Relay braucht eine Sitzung, wie der Rest der API, und prüft jede Verbindung gegen die Datei;
der Name, den die anderen sehen, ist der des angemeldeten Benutzers ([Konten](accounts.md)).

1. Die Editor-Seite öffnet einen WebSocket zu `/api/collab/:fileId` (`joinSession` in
   `packages/editor-core/src/collab.ts`).
2. Der Server antwortet mit einer eigenen ersten Nachricht,
   `{"type":"schreibzeug:session","baseVersion":n}`: der Dateiversion, von der die Sitzung ausging.
   Die erste Person, die eine Datei öffnet, startet die Sitzung bei der neuesten Version der Datei;
   alle nach ihr bekommen dieselbe Version.
3. Die Seite lädt die Bytes dieser Version (`GET /api/files/:id/content?version=n`), konvertiert
   sie und startet die Engine im Online-Modus. Die Engine authentifiziert sich dann, bekommt alle
   Änderungen seit dem Start der Sitzung (`authChanges`) und spielt sie darauf ab.

Alle öffnen dieselben Bytes und wenden dieselben Änderungen in derselben Reihenfolge an, also
stimmen alle Kopien überein. Ein PDF nimmt denselben Weg, ohne die Konvertierung: Die Engine öffnet
das PDF selbst, und das Speichern schreibt die Änderungen hinein ([PDFs](pdf.md#together)).

## Die Seite der Engine { #the-engine-side }

`sdkjs` spricht mit dem Document Server über socket.io (`common/docscoapi.js`). Es nimmt den
socket.io-Client aus `window.io`, wenn das eine Funktion ist (`common/editorscommon.js`
`getSocketIO`), also legt Schreibzeug dort einen Ersatz ab, bevor die Engine startet
(`packages/editor-core/src/frame-socket.ts`). Der Ersatz reicht Nachrichten als JSON-Text durch den
Kanal und feuert `connect`, `disconnect` und `message`, wie socket.io es täte. Nachrichten vom
Relay werden mit dem eigenen `JSON` des Frames geparst, weil die Engine Werte mit `instanceof`
prüft.

Um den Offline-Modus zu verlassen, bekommt die Dokumentinfo eine echte URL statt
`AscCommon.offlineMode`: eine Blob-URL des konvertierten Dokuments. Die Engine schickt sie in ihrem
Öffnen-Befehl, und das Relay gibt sie in `documentOpen` zurück, sodass jede Engine die Kopie
öffnet, die sie selbst konvertiert hat.

Wenn das Dokument angezeigt wird, schaltet der Editor die schnelle gemeinsame Bearbeitung ein, wie
es die Editoren von web-apps tun (`Collaboration.jsx` `onDocumentReady`):
`asc_SetFastCollaborative(true)`, keine Änderungsmarkierungen
(`SetCollaborativeMarksShowType(None)`) und `asc_setAutoSaveGap(1)`, wodurch die Engine ihre
Änderungen etwa einmal pro Sekunde schickt. Die Dokumentinfo trägt den Co-Editing-Modus `fast`.

## Nachrichten { #messages }

Das Relay (`apps/server/src/collab/session.ts`) beantwortet die Nachrichten, die `sdkjs` schickt,
in der Form, die `DocService/sources/DocsCoServer.js` verwendet:

| Von der Engine | Das Relay antwortet |
|---|---|
| (Verbindung) | `license`: eine gültige Lizenz mit Bearbeitungsrechten. |
| `auth` | an den Absender `authChanges` (das Änderungsprotokoll), `auth` (Sitzungs-ID, Teilnehmer, Sperren, Index des Benutzers) und `documentOpen`; an die anderen `connectState`. |
| `auth` mit `sessionId` | eine Wiederverbindung, siehe unten. |
| `isSaveLock` | `saveLock: false`: Die Engine darf senden. |
| `saveChanges` | an die anderen `saveChanges` mit den neuen Änderungen; an den Absender `unSaveLock` (oder `savePartChanges` für einen Teil eines längeren Speichervorgangs). `deleteIndex` verwirft Änderungen, die ein wiederverbundener Client erneut schickt. |
| `getLock` | alle Sperren an alle. Blöcke, die niemand hält, werden genommen; ist einer der angefragten schon gehalten, entscheidet die Regel des Editors (`src/collab/locks.ts`, portiert aus `_checkLockWord`, `_checkLockExcel`, `_checkLockPresentation`): Text gewährt alles, Tabellen verweigern überlappende Bereiche auf demselben Blatt, Präsentationen dieselbe Folie oder dasselbe Objekt. |
| `unLockDocument` | verwirft Änderungen ab `deleteIndex`; mit `releaseLocks` `releaseLock` an den Absender und die anderen; mit `isSave` `unSaveLock` (-1) an den Absender, der darauf wartet, bevor er wieder sendet. |
| `cursor` | den Cursor an die anderen. |
| (der Upload eines Speichervorgangs) | `schreibzeug:saved` mit dem Index, den die neueste gespeicherte Version hält, an alle; siehe [Speichern](#saving). |
| (Verbindungsabbau) | `connectState` an die anderen; die Sperren der Person werden freigegeben. |

`auth` übergibt die Sperren für Textdokumente als Map und für die anderen Editoren als Liste, und
die `excelAdditionalInfo` von Tabellen geht mit ihren Änderungen an die anderen weiter, wie
DocsCoServer es tut. Was es noch nicht tut: die Bereichssperren anderer Personen verschieben, wenn
jemand Zeilen oder Spalten einfügt oder löscht (`_recalcLockArray`); ihre nächste Sperranfrage
rückt sie zurecht.

Wer die Datei nur ansehen darf, tritt als Betrachter bei: Der Hub setzt `mode: "view"` in seinem
`auth` und ignoriert, was das Dokument ändern würde, auch die Sperren, die ein Betrachter beim
Wiederverbinden ankündigt ([Teilen](accounts.md#sharing)).

Der Zugriff wird geprüft, wenn eine Verbindung öffnet, und erneut, wann immer er sich geändert haben
kann: Nachdem eine Freigabe gesetzt oder entfernt wurde und nachdem eine Datei oder ein Ordner
verschoben, in den Papierkorb gelegt oder wiederhergestellt wurde, lassen die Datei-Routen den Hub
jede offene Verbindung prüfen (`hub.ts` `revalidate`, über `src/sockets.ts`). Wer die Datei
verloren hat, und ein Bearbeiter, der sie jetzt nur noch ansehen darf, wird hinausgeschickt, so wie
DocsCoServer eine Verbindung abwirft, deren Rechte sich geändert haben: Die Engine bekommt `drop`
mit dem sdkjs-Code `accessDeny` und hört auf, sich neu zu verbinden, die Verbindung verlässt die
Sitzung sofort, und der Socket schließt mit 4403. Der Editor zeigt den Fehler der Engine; erneut
geöffnet, kommt das Dokument so, wie die Rolle es jetzt erlaubt. Der Job-Socket des
[MCP-Servers](mcp.md#editing-in-the-open-tab) wird genauso geprüft.

Eine Verbindung endet auch mit der Anmeldesitzung, mit der sie geöffnet wurde: Bei Abmeldung, einer
widerrufenen Sitzung, einer Passwortänderung, die die anderen Geräte abmeldet, oder wenn Kontext die
Person überall abmeldet ([Konten](accounts.md)), bekommt die Engine `drop` mit `sessionAbsolute`,
und der Socket schließt mit 4401.

Der Hub (`hub.ts`) hält eine Sitzung pro Datei im Speicher und stellt die Antworten zu; `routes.ts`
macht das WebSocket-Upgrade mit Hono auf Bun. Fehlerhafte Nachrichten schließen den Socket mit Code
4400, eine unbekannte Datei mit 4404, verlorener Zugriff mit 4403, eine beendete Anmeldung mit 4401
(`src/collab/limits.ts` `SOCKET_CLOSE`).

## Verbindung verloren { #losing-the-connection }

Der Kanal verbindet sich von selbst neu, mit wachsender Pause bis zu fünf Sekunden. Solange die
Verbindung weg ist, startet die Engine ihre Aktion `Disconnect` und nimmt keine Bearbeitungen an
(`common/apiBase.js` `CoAuthoringApi.onDisconnect`); die Statuszeile des Editors sagt „Verbindung
unterbrochen“, bis die Aktion endet. Die Engine kommt mit ihrer alten Sitzungs-ID zurück. Das Relay
stellt die Sitzung wieder her, wenn es diese ID vergeben hat oder die vorherige Sitzung der Datei,
die mit allem gespeichert bei der Version endete, die die neue Sitzung öffnet, und der Client bis zu
seiner letzten Änderung dabei war (einer Sitzung, die nach einem Neustart des Servers neu begann,
fehlen die Änderungen, die die Kopie der Engine haben kann, also muss die Engine das Dokument neu
öffnen), wenn niemand sonst das Dokument inzwischen geändert hat (die letzte Änderung von jemand
anderem ist die, die der Client zuletzt gesehen hat, `lastOtherSaveTime`) und die Blöcke, die die
Engine noch hält, dieselbe Prüfung bestehen wie bei einem `getLock`: Eine Textsperre, die jemand
anderes inzwischen genommen hat, bleibt dessen, und ein Tabellen- oder Folienblock, den die Regel
des Editors verweigert, beendet die Wiederherstellung („Restore error. Locks not checked.“,
DocsCoServer.js `auth` mit `getLock(…, true)`). Sonst antwortet es mit Fehler 4004, und das
Dokument muss neu geöffnet werden. Hat das Relay eine neue Sitzung bei einer anderen Version
begonnen, teilt der Kanal der Engine mit, dass die Wiederverbindung gescheitert ist. Eine Sitzung,
die die IDs der vorherigen übernimmt, beginnt ihren Benutzerindex außerdem hinter deren Indizes,
sodass wer frisch beitritt, nie einen Index bekommt, den eine wiederhergestellte Engine noch nutzt
(sdkjs baut seine Objekt-IDs daraus, `common/editorscommon.js` `CIdCounter`).

Das Relay vermerkt zu jeder Sitzungs-ID, die es vergibt, das Konto und den Benutzerindex, mit dem
sie kam. Nur dieses Konto darf mit der ID zurückkommen, und es bekommt diesen Index wieder; der
Index, den die Engine ankündigt, wird ignoriert, und nur ein frisches `auth` rückt den nächsten
Index der Sitzung weiter. Die Engine stellt jedem Objekt, das sie anlegt, ihren Index voran
(`common/editorscommon.js` `CIdCounter`), zwei Personen mit einem Index würden also Objekte mit
denselben IDs anlegen.

## Speichern { #saving }

Die Sitzung lebt nur im Speicher des Servers. Sie endet, wenn die letzte Person geht, sobald eine
gespeicherte Version ihr ganzes Protokoll hält; bis dahin bleibt sie, sodass jemand, dessen
Verbindung abriss, bevor sein Editor gespeichert hat, sie wiederherstellen kann, und wer die Datei
als Nächstes öffnet, öffnet die Version der Sitzung, spielt das Protokoll ab und speichert es. Eine
Version, die inzwischen von außerhalb der Sitzung gespeichert wurde (eine wiederhergestellte
Version, ein Upload, eine MCP-Bearbeitung), ist neuer als die wartenden Änderungen und gewinnt: Die
nächste Person öffnet sie, wie ohne die Sitzung. Ein Speichervorgang der Sitzung selbst, der
ankam, nachdem die Verbindung seines Editors abgerissen war, zählt nicht als von außen. Die
Datei-Route kündigt einen Speichervorgang an, bevor sie etwas speichert (`hub.ts` `begin`), und die
letzte Person, die geht, beendet die Sitzung nur, wenn eine gespeicherte Version das ganze
Protokoll hält und kein Speichervorgang läuft: Einer, der später ankommt, ist die neueste Version
und kann weniger enthalten. Eine Sitzung, deren Protokoll ein später Speichervorgang vervollständigt
hat, bleibt bis zur nächsten Person oder einer Wiederherstellung. Ein Neustart des Servers verliert,
was keine gespeicherte Version hält. Deshalb speichert der Editor von selbst.

Eine Sitzung, in der niemand ist, wartet eine Stunde (`IDLE_SESSION_MS` in `hub.ts`); dann endet
sie, und Änderungen, die keine gespeicherte Version hält, sind weg, wie nach einem Neustart. Ein
Client, der seine Verbindung verloren hat, gibt lange vorher auf. Auch das Protokoll hat eine
Obergrenze (`src/collab/limits.ts`): 100.000 Änderungen oder 64 MiB. Eine Änderung darüber wird
nicht angenommen; das Relay schickt der Engine `drop` (sdkjs `c_oCloseCode.drop`), die sich
endgültig trennt und im Ansichtsmodus bleibt, mit weiterhin möglichem Download. Der Server nimmt
WebSocket-Nachrichten bis 8 MiB an (`maxPayloadLength` in `main.ts`) und schließt den Socket bei
einer größeren; die Engine teilt ihre Änderungen in Nachrichten von etwa 1,5 MiB
(`common/docscoapi.js` `websocketMaxPayloadSize`).

Speichern funktioniert wie ohne Zusammenarbeit: Der Editor konvertiert seine Kopie zu .docx und
speichert sie als neue Version. Alle Kopien haben denselben Inhalt, also speichert das Speichern
einer Person die Änderungen aller. Der speichernde Editor schickt mit dem Upload den Header
`x-schreibzeug-session-save: b:n`: Seine Kopie stammt aus der Sitzung, die bei Version `b` begann,
und hält die ersten `n` Änderungen ihres Protokolls. Die Datei-Route teilt es dem Relay mit
(`hub.ts` `stored`), auch wenn die Verbindung des Editors inzwischen abgerissen ist; eine Version,
die ohne den Header gespeichert wird, ist von außen. Ein Speichervorgang, dessen Kopie bekanntermaßen
alt ist, wird mit 409 abgelehnt, bevor er etwas speichert, da er als neueste Version Änderungen
verlöre: einer aus einer anderen Sitzung als der jetzt offenen der Datei oder aus einer Sitzung,
die mit gespeichertem Protokoll endete. Nach einem Neustart des Servers kennt das Relay keine von
beiden, und der Speichervorgang wird gespeichert: Die Kopie des Editors ist vielleicht die einzige
seiner Änderungen. Versionen werden nummeriert, wie sie gespeichert werden, also ist der Index der
neuesten das, was gespeichert ist, auch wenn er niedriger ist als der einer früheren (ein
langsamerer Speichervorgang, der vor einem schnelleren begann). Das Relay schickt
`{"type":"schreibzeug:saved","index":n}` damit an alle (und an alle, die später beitreten), sodass
jeder Editor weiß, ob die Sitzung der gespeicherten Datei voraus ist.

Jeder Editor zählt das Protokoll aus den Nachrichten des Relays
(`packages/editor-core/src/session-progress.ts`): `authChanges` trägt das ganze Protokoll,
`saveChanges` und `unSaveLock` die Länge des Protokolls nach der neuesten Änderung. Das eigene
„modified“-Flag der Engine hilft hier nicht: In der schnellen gemeinsamen Bearbeitung fällt es,
sobald das Relay eine Änderung hat. „Nicht gespeicherte Änderungen“ und die Warnung vor dem
Schließen des Tabs bedeuten deshalb: Die Engine hat Änderungen, die sie nicht geschickt hat, oder
das Protokoll ist der gespeicherten Version voraus.

Ein Bild, das jemand einfügt, wird zuerst auf dem Server gespeichert (`POST /api/files/:id/media`);
die Änderung trägt nur seinen Namen. Eine Engine, die auf einen Namen trifft, für den sie keine URL
hat, fragt das Relay, wie sie den Document Server fragen würde
(`common/CollaborativeEditingBase.js` `SendImagesUrlsFromChanges`:
`{"type":"rpc","data":{"type":"pathurls","data":["media/<name>"]}}`, beantwortet in
DocsCoServer.js `startRPC` mit Storage-URLs). Das Relay antwortet mit der Bild-Route der Datei,
`/api/files/<id>/media/<name>` (`answerRpc` in `src/collab/session.ts`), sodass jede Kopie, auch
eine, die später beitritt und das Protokoll abspielt, das Bild zeigen und in die Datei schreiben
kann, die sie speichert.

Wenn das Protokoll voraus ist, speichert der Autor der neuesten Änderung drei Sekunden danach, alle
anderen nach fünfzehn, falls diese Person gegangen ist. Jede neue Änderung startet das Warten neu.
Ein Speichern, das angefordert wird, während eines läuft, folgt diesem. Jeder Speichervorgang ist
eine Version, also hinterlässt eine Sitzung mehrere Versionen.

## Tests { #tests }

`apps/server/test/collab.test.ts` deckt die Sitzungsfunktionen und den Hub ab, `locks.test.ts` die
Sperren, `collab-limits.test.ts` die Obergrenze des Protokolls und das Ende untätiger Sitzungen,
`collab-revocation.test.ts` das Schließen von Sockets, wenn der Zugriff oder die Anmeldung endet,
`packages/editor-core/test` den Kanal, den Socket-Ersatz und das Zählen der Speichervorgänge.
`e2e/collaboration.spec.ts` öffnet dieselbe Datei in zwei Browser-Kontexten: Beide tippen und sehen
den Text des anderen; einer verliert seine Verbindung, wartet, bis sie zurückkommt, und bearbeitet
weiter; eine Änderung wird gespeichert, ohne dass jemand „Speichern“ drückt; zwei Personen füllen
eine Tabelle; und zwei bearbeiten verschiedene Textfelder einer Folie.
