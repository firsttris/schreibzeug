# Die Desktop-App { #the-desktop-app }

`apps/desktop` ist Schreibzeug als Desktop-App für Windows, macOS und Linux, gebaut mit Tauri 3
(Alpha). Sie arbeitet an einem von zwei Orten, gewählt auf ihrer Startseite und für den nächsten
Start gemerkt:

- **Auf diesem Computer**: die Dateien im Dokumente-Ordner (oder einem anderen Ordner), über einen
  kleinen Server, den die App neben ihrem Fenster startet ([unten](#files-on-this-computer)). Kein
  Konto, kein Netzwerk.
- **Auf einem Schreibzeug-Server**: Die App fragt einmal nach der Adresse des Servers, merkt sich die
  letzten und zeigt dann die eigene Web-App des Servers. Alles, was der Browser kann, funktioniert
  genauso, und ein Update des Servers aktualisiert auch die Seiten der App.

```
                      ┌─▶ http://127.0.0.1:<port> (apps/local + the web app inside the app) ─▶ ~/Documents
Schreibzeug window (Tauri) ┤
  start page          └─▶ https://your-server (apps/server + apps/web/dist)
```

## Wie es zusammenpasst { #how-it-fits-together }

- **Die Startseite** (`apps/desktop/index.html`, `src/main.ts`, `src/servers.ts`, `src/start.ts`)
  ist die eigene Seite der App. „Öffnen“ startet den lokalen Server und öffnet den Ordner; „Ordner
  ändern …“ wählt einen anderen. Für einen Server ergänzt sie, was eingetippt wird
  (`schreibzeug.example.org` bekommt `https://`, `localhost:3000` oder eine Adresse im lokalen Netz
  `http://`), prüft, dass unter `/api/health` etwas antwortet, und behält die letzten fünf Server in
  ihrem eigenen Speicher. Der nächste Start geht dorthin zurück, wo die App zuletzt war: zum Ordner
  oder zum neuesten Server.
- **Der Server liefert die Web-App aus**: Wenn `SCHREIBZEUG_WEB_DIR` auf `apps/web/dist` zeigt,
  beantwortet der API-Server jeden Pfad, der nicht `/api` ist, mit der gebauten App und unbekannte
  Pfade mit `index.html` (`apps/server/src/web.ts`). Das Fenster lädt die Adresse des Servers
  direkt, sodass Sitzungen, der Socket der Zusammenarbeit und die Engine genau wie in einem Browser
  auf diesem Server funktionieren; keine Cross-Origin-Anfragen, keine zweite Kopie der Oberfläche in
  der App.
- **Das Fenster** (`src-tauri/src/lib.rs`): Downloads gehen in den Download-Ordner („Downloads“ im
  Home-Verzeichnis, wo Linux keinen eingerichtet hat), ohne eine Datei zu überschreiben
  (`downloads.rs`). Eine Seite desselben Servers, die ein neues Fenster öffnet (ein neues oder
  kopiertes Dokument), bekommt ein Fenster der App, in dem die Sitzung gilt; jeder andere Link
  (Strg+Klick auf einen Link in einem Dokument) öffnet sich im Browser des Systems, nur für http,
  https und mailto. „Auf diesem Computer“, „Ordner wählen …“ und „Mit Server verbinden …“ (zurück
  zur Startseite) stehen im ⋮-Menü neben dem Namen unten links; das Fenster hat keine eigene
  Menüleiste, nur macOS behält eine oben am Bildschirm. Die App markiert jede Seite, die sie zeigt
  (`window.schreibzeugDesktop`), und ein Befehl ist eine Navigation zu
  `https://desktop.schreibzeug.invalid/<command>`, die das Fenster abfängt, bevor sie lädt
  (`windows.rs` `desktop_action`), sodass weder die lokalen noch die Seiten eines Servers dafür
  native Aufrufe brauchen (`apps/web/src/desktop.ts`).
- **Der lokale Server** (`local.rs`): beim ersten Gebrauch mit einem zufälligen Schlüssel gestartet,
  mit der App beendet; er endet auch, wenn sein stdin schließt, sodass eine abgestürzte App nichts
  laufen lässt. Ein neuer Ordner startet ihn neu und schließt die Fenster, die den alten zeigten.
  Der Ordner wird in `settings.json` im Konfigurationsordner der App gespeichert (`settings.rs`);
  ohne Eintrag ist es der Dokumente-Ordner des Systems (der Known Folder von Windows, `~/Documents`
  auf macOS, der von XDG auf Linux), in der App „Dokumente“ genannt.
- **Native Aufrufe nur von der Startseite**: Ihre drei Befehle (`open_local`, `local_folder`,
  `choose_folder`) gehören der App selbst; die Seiten eines Servers oder des lokalen Servers
  bekommen keine (`capabilities/default.json` gewährt nur die Core-Standards, und nur dem eigenen
  Fensterinhalt der App).

Die Browser-Engine ist auf Windows (WebView2, Chromium) und macOS (WebKit) die des Systems. Auf
Linux bringt die App Chromium selbst mit (CEF, `tauri-runtime-cef` von Tauri 3) statt WebKitGTK,
das mit dem Canvas der Editoren langsam ist und sich von den Browsern unterscheidet, in denen die
Web-App getestet wird. Das macht die Linux-Pakete um etwa 170 MB größer. In einem Linux-Build kann
nur eine Engine stecken (die Runtime von WebKitGTK baut auf GTK 3, CEF auf GTK 4), deshalb läuft
der Ordnerdialog dort über das XDG Desktop Portal (den eigenen Dialog des Desktops) statt über
GTK 3. Tauri 3 und seine CEF-Runtime sind Alpha-Versionen.

Chromium, wie CEF es baut, spricht von sich aus mit Google: Secure-DNS-Proben, Anmeldestatus,
Suche, das Übersetzungsmodell, Netzwerkzeit und Komponenten-Updates. Die App schaltet all das ab
(`runtime()` in `src-tauri/src/lib.rs`); ein Net-Log der App (`--log-net-log`) zeigt dann nur
Anfragen an die eigenen Seiten und den Server der App. In den Linux-Paketen verschiebt der Bundler
das Binary der App nach `/usr/share/Schreibzeug/` und lässt den lokalen Server in `/usr/bin/`; die
App sucht an beiden Stellen (`local.rs`).

## Dateien auf diesem Computer { #files-on-this-computer }

`apps/local` ist ein kleiner Server, um ohne Schreibzeug-Server zu arbeiten: Er spricht den Teil der
Dateien-API, den eine einzelne Person braucht (dieselben Routen und Formen wie `apps/server`, aus
`@schreibzeug/files-api`), über einem Ordner auf dem Computer, standardmäßig dem Dokumente-Ordner
des Systems. Die Web-App ist dieselbe; sie fragt `/api/info`, mit welcher Art Server sie spricht,
benennt bei `local` die oberste Ebene nach dem Ordner („Dokumente“) und lässt weg, was nur mit
Konten sinnvoll ist.

- **Dateien sind die Dateien**: Ein Ordner in der App ist ein Ordner auf der Festplatte, eine Datei
  ist eine Datei. Neue Dokumente, Uploads, Kopien, Umbenennen und Verschieben geschehen dort; ein
  Speichern überschreibt die Datei (zuerst unter einem temporären Namen daneben geschrieben, dann
  umbenannt). Versteckte Dateien, die `~$`-Sperrdateien von Office und `desktop.ini`/`Thumbs.db`
  werden nicht gelistet, und eine neue Datei, ein Ordner oder ein Name, den die Liste verstecken
  würde, wird abgelehnt (400), bevor auf der Festplatte etwas geschieht.
- **IDs**: Die API benennt Knoten per UUID; hier ist die ID eines Knotens eine UUID v5 seines Pfads
  unterhalb der obersten Ebene, sodass ein Link nach einem Neustart gleich bleibt. Ein Umbenennen
  oder Verschieben behält die ID, solange der Server läuft (`src/ids.ts`), sodass ein offener Editor
  bei seiner Datei bleibt.
- **Löschen** verschiebt in den Papierkorb des Systems (`gio trash` auf Linux, der Finder auf macOS,
  der Papierkorb auf Windows; `src/trash.ts`) und gilt erst als erledigt, wenn die Datei weg ist. Es
  gibt keine eigene Papierkorb-Seite, kein Teilen, keine Links, keine Versionen zum Zurückgehen,
  keine Suche und keine Jobs für ein offenes Dokument; diese Routen antworten „Das gibt es nur auf
  einem Schreibzeug-Server“ (`src/app.ts`). Die Versionsnummer zählt nur die Speichervorgänge seit
  dem Start des Servers, die die Bearbeitungssitzung braucht.
- **Speicherplatz**: `/api/storage` nennt den Platz auf dem Laufwerk des Ordners und keine eigene
  Belegung; die App zeigt dafür keinen Balken, das übernimmt der Dateimanager des Systems, nur den
  Hinweis, wenn weniger als 1 GB frei ist ([Dateien](files.md#storage)).
- **Markdown- und Textdateien** öffnen sich im Texteditor ([Markdown- und Textdateien](text.md)):
  Ein Speichern geht nur durch, solange die Datei auf der Festplatte noch die Bytes sind, aus denen
  es entstand, sodass eine Änderung durch ein anderes Programm (einen Editor, ein Sync-Werkzeug)
  nicht überschrieben wird; der Editor fragt stattdessen.
- **Bearbeiten** nutzt dasselbe Relay wie der Server (`apps/server/src/collab`), sodass zwei
  Fenster auf derselben Datei gemeinsam bearbeiten. Eine Sitzung öffnet die Version, bei der sie
  begann, und spielt ihre Änderungen darauf ab, auch nachdem Speichervorgänge die Datei
  weitergebracht haben; der Ordner behält keine älteren Versionen, deshalb hält der Server die
  Bytes der ersten Version jeder Sitzung, solange die Sitzung dauert (`src/session-bases.ts`), und
  liefert sie für `?version=` aus (eine Datei, die vor dem ersten Laden der Sitzung von außen
  geschrieben wurde, ohne dass schon eine Änderung gemacht ist, startet die Sitzung, wie sie ist).
  Bilder, die beim Bearbeiten eingefügt werden, warten in einem Cache-Ordner, bis die Datei mit
  ihnen gespeichert ist.
- **Nur für diesen Computer** (`src/gate.ts`): Der Server lauscht auf 127.0.0.1 und will den
  Schlüssel, den die App beim Start erzeugt hat. Die App öffnet `/api/local/unlock?token=…`, das ein
  HttpOnly-Cookie mit SameSite=Strict hinterlässt; eine Anfrage mit fremdem Hostnamen (DNS
  Rebinding) oder eine Änderung, die von der Seite einer anderen Site geschickt wird, wird
  abgelehnt.
- **MCP** (`src/mcp.ts`): `/mcp` bietet dieselben Werkzeuge wie ein Server
  ([MCP-Server](mcp.md#on-this-computer)), ohne Schlüssel, hinter derselben Prüfung von Host und
  Origin; seine Werkzeuge erreichen die lokale API mit dem eigenen Schlüssel der App. Die App
  startet den lokalen Server auf einem freien Port (`PORT=0`, `src-tauri/src/local.rs`), bei jedem
  Start einem anderen, sodass ein MCP-Client, der mit der Adresse der App eingerichtet ist, nach
  einem Neustart der App nicht mehr funktioniert.

| Variable | Bedeutung |
|---|---|
| `SCHREIBZEUG_LOCAL_ROOT` | Der gezeigte Ordner; ohne Angabe `~/Documents`, sonst das Home-Verzeichnis |
| `SCHREIBZEUG_LOCAL_ROOT_NAME` | Wie die App ihn nennt; ohne Angabe der eigene Name des Ordners |
| `SCHREIBZEUG_LOCAL_TOKEN` | Der Schlüssel (mindestens 16 Zeichen); ohne Angabe ein zufälliger, ausgegeben mit der Entsperr-Adresse |
| `PORT` | 0 (Standard): irgendein freier Port |
| `SCHREIBZEUG_WEB_DIR` | Die gebaute Web-App, die neben der API ausgeliefert wird |
| `SCHREIBZEUG_LOCAL_CACHE` | Wo Bilder warten, bis sie gespeichert sind; standardmäßig ein Ordner im Temp-Ordner des Systems |
| `SCHREIBZEUG_MAX_UPLOAD_MB` | Die größte Datei zum Hochladen oder Speichern; standardmäßig 512 |
| `SCHREIBZEUG_LOCAL_EXIT_WITH_STDIN` | `1`: beenden, wenn stdin schließt; das setzt die Desktop-App, damit der Server mit ihr endet (`src-tauri/src/local.rs`) |
| `USER`, `USERNAME` | Der Name, der für die eine Person gezeigt wird; der Name des Systemkontos |

Sobald er lauscht, gibt er `SCHREIBZEUG_LOCAL_READY http://127.0.0.1:<port>` aus. Von Hand, mit dem
Dev-Server der Web-App davor:

```sh
SCHREIBZEUG_LOCAL_ROOT=~/Dokumente PORT=3300 bun run --filter @schreibzeug/local start
SCHREIBZEUG_API_URL=http://localhost:3300 bun run --filter @schreibzeug/web dev
# dann http://localhost:5173/api/local/unlock?token=<das ausgegebene Token> öffnen
```

## Bauen { #building }

Die App enthält die gebaute Web-App (`apps/web/dist`, mit der Engine) und den lokalen Server,
mit `bun build --compile` zu einem Executable pro Plattform kompiliert (`scripts/sidecar.ts`, von
Tauri vor jedem Build nach `src-tauri/binaries/` ausgeführt). Also zuerst die Web-App bauen:

```sh
bun run engine:prepare && bun run build          # apps/web/dist (Linux x86_64 für die Schriften der Engine)
bun run --filter @schreibzeug/desktop desktop:dev     # die App gegen den Dev-Server der Startseite
bun run --filter @schreibzeug/desktop desktop:build   # Installer für diesen Rechner
```

Die Schriften der Engine und die Bun-Runtime machen die Installer groß (etwa 200 MB); die Schriften
zu verschlanken kommt später.

Linux braucht GTK 4.14 oder neuer (`libgtk-4-dev librsvg2-dev`; Ubuntu 24.04, Debian 13); Chromium
(CEF, etwa 1 GB) lädt der erste Build herunter, nach `CEF_PATH`, falls gesetzt. Der Workflow
**Actions → Desktop app** baut die Web-App einmal auf Linux und dann alle drei Plattformen:
AppImage, .deb und .rpm; .msi und eine Setup-.exe; eine .dmg für Intel und Apple Silicon. Von Hand
gestartet behält er sie als Artefakte; jedes Release (**Actions → Bump version**, siehe
[Entwicklung](development.md#releases)) baut sie ebenfalls und hängt sie an das GitHub-Release. Die
Version kommt aus `apps/desktop/package.json`, das der Bump auf der Version des Releases hält. Die
.rpm wird mit zstd auf Stufe 3 komprimiert und die Setup-.exe mit zlib (`tauri.conf.json`) statt
mit den Standards des Bundlers, zstd auf Stufe 19 und LZMA, die jeweils etwa vier Minuten
brauchten, für eine etwas größere Datei.

### Gepatchte Tauri-CLI { #patched-tauri-cli }

Vorübergehend, bis Tauri es behebt ([#12](https://github.com/firsttris/schreibzeug/issues/12)): Der
Bundler von Tauri 3 Alpha kopiert `libEGL.so` und `libGLESv2.so` aus CEF in jedes Linux-Paket, und
CEF 154 liefert sie nicht mehr mit, also scheitert jedes Linux-Paket. Auf Linux baut
`apps/desktop/scripts/tauri.ts` deshalb die Tauri-CLI der Version in `package.json` aus den Quellen
von Tauri, mit `apps/desktop/patches/*.patch` angewendet (einmal, nach
`src-tauri/target/patched-cli/`), und die Skripte des Desktop-Pakets nutzen sie: `tauri`
(`cd apps/desktop && bun run tauri …`; die Wurzel hat kein solches Skript), `desktop:dev` und
`desktop:build` (der `desktop`-Job der CI baut sie auf `main`, sodass ein Release, das auf seinem
Tag läuft und den Cache von `main` liest, sie dort findet, statt vier Minuten dafür zu brauchen);
Windows und macOS nutzen die veröffentlichte CLI. Das Skript bricht ab, wenn ein Patch auf eine
neue Version nicht mehr passt: Dann prüfen, ob dieses Release den Fehler behebt, und den Patch
entfernen, wie in `apps/desktop/patches/README.md` beschrieben.

Die Builds sind noch nicht signiert. Windows SmartScreen zeigt „Unbekannter Herausgeber“
(„Weitere Informationen“ → „Trotzdem ausführen“). macOS Gatekeeper verweigert beim ersten Mal das
Öffnen der App; seit macOS 15 (Sequoia) kommt Rechtsklick → „Öffnen“ nicht mehr daran vorbei:
Versuche die App einmal zu öffnen und erlaube sie dann unter „Systemeinstellungen“ → „Datenschutz &
Sicherheit“ → „Dennoch öffnen“. Linux-Pakete brauchen keine Signatur.

## Tests { #tests }

`apps/local/test/files.test.ts` führt die lokale API über einem temporären Ordner aus,
`gate.test.ts` die Prüfung von Host, Origin und Schlüssel, `mcp.test.ts` den MCP-Endpunkt,
`units.test.ts` die Einstellungen und die IDs. `e2e/local.spec.ts` öffnet die App auf dem lokalen
Server und arbeitet mit Dateien in seinem Ordner; `apps/desktop/src/*.test.ts` deckt die Startseite
ab.

## Als Nächstes { #next }

- Lokale und Server-Dateien nebeneinander, mehrere Ordner.
- Schreibzeug als Standard-App für .docx, .xlsx und .pptx.
- Signieren und Updates über den Tauri-Updater.
