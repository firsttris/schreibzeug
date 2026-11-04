# Entwicklung { #development }

Voraussetzung sind [Bun](https://bun.sh) 1.4 oder neuer und Linux x86_64. Das Vorbereiten der
Bearbeitungs-Engine (`engine/scripts/prepare.ts`) lädt das festgelegte Euro-Office-Release herunter,
etwa 630 MB, entpackt es mit `ar`, `tar -xJ` und `unzip` (auf Debian und Ubuntu: `binutils`,
`xz-utils`, `unzip`) und führt seinen Schriftgenerator aus, ein Linux-x86_64-Binary. `bun run dev`
erledigt diesen Schritt zuerst, also arbeite auf macOS oder Windows in einer Linux-VM oder einem
Container. Die Datenbank ist eine SQLite-Datei; sonst muss nichts installiert werden.

```bash
git clone https://github.com/firsttris/schreibzeug && cd schreibzeug
bun install
bun run dev              # http://localhost:5173, mit der API auf http://localhost:3000
```

`bun run dev` bereitet zuerst die Engine vor (`bun run engine:prepare`: lädt das festgelegte
Euro-Office-Release herunter und erzeugt seine Schriften; tut nichts, sobald sie aktuell ist),
startet dann den Server (Daten: `SCHREIBZEUG_DATA_DIR`) und die Web-App zusammen mit
`bun run --parallel dev:server dev:web` (nicht `bun run --filter`: Das führt Workspaces in der
Reihenfolge ihrer Abhängigkeiten aus, und da `apps/web` von `apps/server` abhängt, würde es auf das
endlose `dev` des Servers warten, bevor es Vite startet). Scheitert Vite, wird auch der Server
gestoppt; ein Server, der abstürzt, wartet unter `bun --watch` auf die nächste Änderung, Vite läuft
also weiter. Strg+C stoppt beide. `bun run --parallel` leitet ihre Ausgabe durch eine Pipe, deshalb
setzt `dev` `FORCE_COLOR=1`, wenn es in einem Terminal läuft, damit die Farben bleiben; die
Tastenkürzel von Vite (`h`, `r`, `o`, `q`) funktionieren nur, wenn es allein läuft:
`bun run dev:web` in einem Terminal, `bun run dev:server` (oder `bun run server`) in einem anderen.
Der Vite-Server leitet `/api` (mit WebSockets) und `/mcp` an den API-Server weiter.

## Prüfungen { #checks }

```bash
bun run engine:prepare   # einmal und nach einer Änderung in engine/: Build und E2E brauchen die Engine
bunx playwright install chromium   # einmal: der Browser von Playwright für die E2E-Tests
bun run lint             # Biome
bun run typecheck        # tsc in jedem Workspace
bun run i18n:check       # jeder Oberflächentext auf Deutsch und Englisch
bun run test             # Vitest auf Bun: Unit- und Integrationstests (SQLite)
bun run test:e2e         # Playwright mit der echten Engine: E2E und Formattreue
bun run build            # die Web-App
mkdocs build --strict    # diese Dokumentation (pip install -r requirements-docs.txt)
```

`bun run build` und die E2E-Tests bereiten die Engine nicht selbst vor, und der Build lässt sie
stillschweigend weg, wenn `engine/dist` fehlt (`apps/web/engine-plugin.ts`): Die App baut dann,
öffnet aber kein Dokument. Ohne den eigenen Browser-Download von Playwright lässt sich ein
installiertes Chromium verwenden: `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome bun run test:e2e`. Die
CI (`.github/workflows/ci.yml`) führt all das aus, die E2E-Suite in drei Shards, dazu die
Rust-Prüfungen der Desktop-App und eine Validierung der E-Rechnungen gegen EN 16931 und PDF/A-3.
Entwurfs-Pull-Requests und Änderungen nur an Markdown oder `docs/` starten sie nicht; „Ready for
review“ schon.

Alle Skripte der `package.json` in der Wurzel:

| Skript | Was es tut |
|---|---|
| `dev` | Bereitet die Engine vor, dann den Server und den Dev-Server der Web-App zusammen |
| `server` | Den Server allein, mit Neustart bei Änderungen |
| `engine:prepare` | Die Engine in `engine/dist` (`--force`, um sie erneut vorzubereiten) |
| `build` | Die Web-App in `apps/web/dist`, mit der vorbereiteten Engine hineinkopiert |
| `build:demo` | Die [Demo](#the-demo) in `apps/web/dist-demo`, für GitHub Pages unter `/schreibzeug/demo/` |
| `preview` | Die gebaute Web-App auf http://localhost:4173, mit `/api` und `/mcp` weitergeleitet wie bei `dev` |
| `typecheck`, `lint` | Die Oberflächentexte kompiliert, dann `tsc -b`; Biome |
| `i18n`, `i18n:check` | Kompiliert die Oberflächentexte (`apps/web/messages`) mit Paraglide; dasselbe, dann die Prüfung, dass jeder Text auf Deutsch und Englisch vorliegt und keiner im Code steht (ein eigener Schritt in der CI) ([Oberflächentexte](architecture.md#interface-texts)) |
| `format` | Biome mit `--write`: korrigiert die Formatierung und was es sonst kann |
| `test`, `test:watch` | Vitest einmal, mit der Prüfung, dass jeder Oberflächentext auf Deutsch und Englisch vorliegt; Vitest, das die Dateien beobachtet |
| `test:e2e` | Playwright, die Projekte `chromium` (die Specs) und `fidelity`; ein Spec-Pfad dahinter führt nur diese Spec aus |
| `test:fidelity`, `fidelity:update` | Nur das Projekt für Formattreue; dasselbe, mit neuen Referenzbildern |
| `screenshots` | Die Bilder in `docs/screenshots` (`e2e/screenshots.shot.ts`) |
| `test-files` | Schreibt die Testdokumente in `test-files/` neu (`test-files/make.ts`) |

## Die Demo { #the-demo }

Die [Demo](https://firsttris.github.io/schreibzeug/demo/) ist die Web-App ohne Server: Ein eigener
Build (`bun run build:demo`, Vite-Modus `demo`, nach `apps/web/dist-demo`) beantwortet die Anfragen
der App an `/api` in der Seite selbst (`apps/web/src/demo/`). Die Engine läuft ohnehin im Browser;
der Server speichert nur die Dateien und leitet die Bearbeitungssitzungen weiter, und beides läuft
hier in der Seite:

- **Die API** ist die lokale API der Desktop-App (`apps/local` `createLocalApp`,
  [Desktop-App](desktop.md#files-on-this-computer)) über Dateien im Speicher (`src/demo/folder.ts`)
  statt über einem Ordner auf der Festplatte, mit einem Gate, das alle hereinlässt (die Seite ist
  der Server). Die App sieht also `/api/info` mit `local` antworten und lässt weg, was nur ein
  Server hat, wie auf dem Computer: Konten, Teilen, Versionen, den Papierkorb, Zugriffstokens.
- **Die Bearbeitungssitzung** ist der eigene Hub des Servers (`apps/server/src/collab/hub.ts`)
  hinter derselben Route für die Zusammenarbeit. `src/demo/page-socket.ts` ist der WebSocket
  zwischen ihnen: der WebSocket-Helfer von Hono auf der Seite der API, das, was `joinSession`
  (`packages/editor-core/src/collab.ts`) auf der Seite der App von einem Browser-WebSocket
  erwartet. Die Editoren öffnen, speichern und speichern automatisch genau wie auf einem Server.
- **Bilder**, die in ein Dokument eingefügt werden, werden aus Blob-URLs gezeigt
  (`src/demo/media.ts`): Die Engine lädt sie aus einem `<img>` in ihrem Frame, das kein
  ausgetauschtes `fetch` erreicht.
- **Start:** `src/main.tsx` importiert `src/demo/install.ts` vor der ersten Anfrage. Es füllt den
  Ordner mit Testdateien (`test-files/angebot.docx`, `preise.xlsx`, `vortrag.pptx`, `notiz.md`,
  `formular.pdf`), tauscht `window.fetch` und `window.WebSocket` für die Anfragen an `/api` aus und
  gibt der App die Blob-URLs für Bilder. `import.meta.env.MODE === "demo"` steht bei jeder Prüfung
  ausgeschrieben, sodass Vite die Demo aus jedem anderen Build herauslässt.
- **Was sie nicht kann:** Die Dateien sind weg, wenn der Tab neu geladen wird; niemand sonst kann
  einer Bearbeitungssitzung beitreten; Uploads und neue Dateien leben im selben Speicher.
- **Pfade:** Die Routen stehen nach dem `#` (`createHashHistory`), da GitHub Pages keinen Fallback
  auf `index.html` hat; die App, die Engine (`engine-plugin.ts` `underBase`) und die Texterkennung
  liegen unter der `base` von Vite, `/schreibzeug/demo/` (eine andere mit
  `DEMO_BASE=/ bun run build:demo`). Der Build enthält die ganze Engine, etwa 350 MB, von denen der
  Browser lädt, was er öffnet.
- **Veröffentlichen:** `docs.yml` baut sie bei jedem Push auf `main` mit der Engine aus dem Cache
  der CI und legt sie unter `/demo/` in die Site.
- **Tests:** `apps/web/src/demo/*.test.ts` (der Ordner, die API mit ihrem WebSocket),
  `e2e/demo.spec.ts` auf dem Dev-Server im Demo-Modus unter demselben Pfad
  (`bunx vite --mode demo`).

## Releases { #releases }

Ein Release ist ein Knopfdruck: **Actions → Bump version → Run workflow**, mit `patch`, `minor`
oder `major` (oder einer Vorabversion: `preminor` ergibt `v0.2.0-rc.1`, `prerelease` den nächsten
Kandidaten, `patch` dann `v0.2.0`). Es erhöht die Version in `package.json`,
`apps/desktop/package.json` und `apps/desktop/src-tauri/Cargo.toml` (mit `Cargo.lock`), committet
„Release vX.Y.Z“ auf `main`, taggt es und startet `release.yml` auf dem Tag. Dieser Workflow
überspringt die Prüfungen, wenn die CI von `main` auf dem Commit vor dem Release-Commit schon
bestanden hat (warte also nach einem Merge auf die CI von `main`, sonst führt das Release die
Prüfungen erneut aus), und baut das Docker-Image und die Desktop-App gleichzeitig. Das Image wird
veröffentlicht, sobald die Prüfungen bestanden sind, ein paar Minuten nach dem Tag, ohne auf die
Installer zu warten (etwa eine Viertelstunde); das GitHub-Release mit den angehängten Installern
folgt, sobald beides da ist. Ein gescheiterter Installer-Build lässt das Image veröffentlicht und
erzeugt kein GitHub-Release. Die geteilten Workflows kommen aus
[firsttris/workflows](https://github.com/firsttris/workflows) (`bump-version.yml`,
`tested-on-main.yml`, `docker-release.yml`, `github-release.yml`).

| Workflow | Was er tut |
|---|---|
| `bump.yml` | **Actions → Bump version**: die nächste Version, ihr Tag und das Release darauf |
| `release.yml` | Bei einem Tag `vX.Y.Z`: die Prüfungen (sofern `main` sie nicht ausgeführt hat), die Desktop-App, das Docker-Image (`docker/Dockerfile`, amd64) und das GitHub-Release |
| `desktop.yml` | **Actions → Desktop app** baut die Desktop-App für Windows, macOS und Linux, vorerst unsigniert; auch Teil jedes Releases |
| `screenshots.yml` | **Actions → Update screenshots** nimmt die Bilder für README und Dokumentation sowie die Referenzen für die Formattreue auf |
| `engine-pin.yml` | Auf einem Renovate-Branch, der die Engine oder den Konverter weiterbewegt: setzt `asset` und `sha256` des neuen Releases in `engine/engine.json` und startet die CI auf diesem Commit |
| `docs.yml` | Veröffentlicht diese Dokumentation und die [Demo](#the-demo) bei jedem Push auf `main` auf GitHub Pages (ein Pull Request, der `docs/` ändert, baut nur die Dokumentation): Englisch unter `/`, Deutsch unter `/de/` (mkdocs-static-i18n). Eine Seite wird durch eine Datei daneben übersetzt (`index.de.md` für `index.md`); ohne sie zeigt die deutsche Site den englischen Text. Die Startseite ist der Rundgang in Bildern, `overview.md` die Übersicht |

## Abhängigkeits-Updates { #dependency-updates }

[Renovate](https://github.com/apps/renovate) (`.github/renovate.json5`) öffnet für jedes neue
Release dessen, worauf Schreibzeug aufbaut, einen Pull Request und listet, was offen ist, im Issue
„Dependency Dashboard“. Keiner davon merged sich selbst:

| Pull Request | Was er bewegt |
|---|---|
| Euro-Office-Engine | `version` der Engine in `engine/engine.json` (Releases des Euro-Office Document Server; Release Candidates bleiben außen vor); `engine-pin.yml` ergänzt `asset` und `sha256`. Wie jedes Engine-Update besteht er nur, wenn die Screenshots der Formattreue gleich bleiben |
| x2t-Konverter | `converter.version` in `engine/engine.json` (cryptpad/onlyoffice-x2t-wasm), genauso |
| Tauri | die Tauri-3-Alphas von `apps/desktop` (Crates und npm-Pakete zusammen); `scripts/tauri.ts` bricht ab, wenn der CLI-Patch nicht mehr passt ([Gepatchte Tauri-CLI](desktop.md#patched-tauri-cli)) |
| Bun | die Bun-Images in `docker/Dockerfile`, `BUN_VERSION` in den Workflows und `@types/bun` |
| Caddy | der Reverse Proxy in `deploy/compose.yaml` |
| Mustang-CLI | der Validator des Jobs `einvoice` in `ci.yml` |

Alles andere (die übrigen Pakete, die Actions, die Images) kommt mit den geteilten Einstellungen von
[firsttris/workflows](https://github.com/firsttris/workflows#renovate-in-every-project): Minor- und
Patch-Updates am 1. des Monats in einem Pull Request, den Renovate selbst merged, wenn die CI grün
ist, Major-Updates nur, wenn sie im Dependency Dashboard angehakt sind, Sicherheitskorrekturen
sofort.

## Stack { #stack }

Eine React-SPA mit TanStack Router und Query, Tailwind und Komponenten im Stil von shadcn
(`apps/web`); Euro-Office `sdkjs` als Bearbeitungs-Engine, angesteuert nur aus
`packages/editor-core`; ein Bun-Server mit Hono, Drizzle und SQLite (`apps/server`); Tauri 3
(Alpha) für die Desktop-App (`apps/desktop`). Warum es so gebaut ist: [Architektur](architecture.md);
wie die Oberfläche mit der Engine spricht: [Die Bearbeitungs-Engine](engine.md).
