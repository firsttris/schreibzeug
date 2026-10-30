<div align="center">

<h1>Schreibzeug – wie Google Docs, nur auf deinem eigenen Server</h1>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/editor-dark.png">
  <img src="docs/screenshots/editor-light.png" alt="Schreibzeug, ein selbst gehosteter Word-Editor im Browser: ein .docx-Dokument mit Werkzeugleiste für Absatzformat, Schrift, Größe, fett, kursiv, Farben, Listen und Ausrichtung" width="900">
</picture>

**Word-, Excel- und PowerPoint-Dateien bearbeiten – .docx, .xlsx, .pptx und PDF, Open Source**<br>
Gemeinsam in Echtzeit, im Browser oder als Desktop-App. Ohne Dokumentenserver und ohne Tracking. Made in Europe.

[![CI](https://github.com/firsttris/schreibzeug/actions/workflows/ci.yml/badge.svg)](https://github.com/firsttris/schreibzeug/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/firsttris/schreibzeug?logo=github&label=release)](https://github.com/firsttris/schreibzeug/releases/latest)
[![Docker Pulls](https://img.shields.io/docker/pulls/tristanteu/schreibzeug?logo=docker&logoColor=white)](https://hub.docker.com/r/tristanteu/schreibzeug)
[![Image Size](https://img.shields.io/docker/image-size/tristanteu/schreibzeug/latest?logo=docker&logoColor=white&label=image)](https://hub.docker.com/r/tristanteu/schreibzeug)
[![Docs](https://img.shields.io/badge/docs-firsttris.github.io%2Fschreibzeug-4f46e5?logo=materialformkdocs&logoColor=white)](https://firsttris.github.io/schreibzeug/)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Desktop](https://img.shields.io/badge/desktop-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/firsttris/schreibzeug/releases/latest)
[![DSGVO](https://img.shields.io/badge/DSGVO-Dateien%20auf%20deinem%20Server-15803d)](#-warum-schreibzeug)
[![Made in Europe](https://img.shields.io/badge/made%20in-Europe-003399)](https://github.com/Euro-Office)
[![MCP server](https://img.shields.io/badge/MCP-Claude%20Code-d97757)](https://firsttris.github.io/schreibzeug/mcp.html)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)](https://bun.sh)
[![React](https://img.shields.io/badge/React-149eca?logo=react&logoColor=white)](https://react.dev)
[![TanStack](https://img.shields.io/badge/TanStack-Router%20%7C%20Query-ff4154?logo=reactquery&logoColor=white)](https://tanstack.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-06b6d4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Vite](https://img.shields.io/badge/Vite-646cff?logo=vite&logoColor=white)](https://vite.dev)
[![Hono](https://img.shields.io/badge/Hono-e36002?logo=hono&logoColor=white)](https://hono.dev)
[![SQLite](https://img.shields.io/badge/SQLite-Drizzle-003b57?logo=sqlite&logoColor=white)](https://orm.drizzle.team)
[![Tauri](https://img.shields.io/badge/Tauri-24c8db?logo=tauri&logoColor=white)](https://tauri.app)

[Warum](#-warum-schreibzeug) •
[Installation](#-installation) •
[Funktionen](#-funktionen) •
[Screenshots](#-screenshots) •
[Alternativen](#-schreibzeug-und-die-alternativen) •
[FAQ](#-faq) •
[Dokumentation](https://firsttris.github.io/schreibzeug/) •
[English](README.md)

🖱️ **[Demo ausprobieren](https://firsttris.github.io/schreibzeug/demo/)** – die Editoren mit Beispieldateien, im Browser, ohne Installation

</div>

## 💡 Warum Schreibzeug?

Office-Pakete aus der Cloud halten deine Dokumente auf fremden Servern und kosten pro Benutzer.
Selbst gehostete Office-Pakete brauchen meist einen eigenen Dokumentenserver neben Nextcloud und
sehen aus wie die Office-Programme von 2010. Schreibzeug ist ein kleiner Server mit einer modernen
Oberfläche.

- **Aus Europa, für Europa**: in Europa entwickelt, Open Source, auf der europäischen Engine
  Euro-Office und deinem Server. Kein US-Anbieter dazwischen, also auch kein Zugriff auf deine
  Dateien über den US CLOUD Act.
- **Deine Dateien bleiben bei dir (DSGVO)**: Dokumente liegen auf deinem Server oder mit der
  Desktop-App auf deinem eigenen Rechner. Keine US-Cloud, kein fremder Dokumentenserver, keine
  Telemetrie.
- **Echte Office-Dateien**: Eine .docx bleibt eine .docx, eine .xlsx eine .xlsx, eine .odt eine
  .odt – Word, Excel und LibreOffice öffnen sie wie vorher.
- **Ausgereifte Kompatibilität**: Die Engine ist Euro-Office, der europäische Open-Source-Fork von
  ONLYOFFICE; Tabellen, Änderungsverfolgung, Kommentare, Diagramme und Pivot-Tabellen kommen heil an.
- **Gemeinsam in Echtzeit**: Mehrere Leute in derselben Datei, mit Cursorn und Kommentaren live,
  ohne Dokumentenserver.
- **E-Rechnungen**: ZUGFeRD-Rechnungen direkt aus einem Rechnungsdokument, E-Rechnungen in PDFs
  werden gelesen und angezeigt.
- **Mit der Tastatur bedienbar**: Menüs und Werkzeugleisten gehen ohne Maus –
  [mehr zur Barrierefreiheit](https://firsttris.github.io/schreibzeug/accessibility.html).
- **KI, wenn du willst**: Claude Code und andere Assistenten finden, lesen und schreiben deine
  Dateien mit deinen Rechten; Änderungen an einem offenen Dokument brauchen deine Zustimmung und
  lassen sich rückgängig machen.
- **Einfach zu betreiben**: ein Container mit einer SQLite-Datenbank und einem Datenordner; wer den
  Ordner sichert, sichert alles.

Läuft auf jedem Linux-Server oder VPS mit Docker oder Podman (amd64), auf einem Heimserver oder ganz
ohne Server als Desktop-App für Windows, macOS und Linux.

## 🚀 Installation

### 1. Von einem Agenten aufsetzen lassen

Gib Claude Code oder einem anderen Coding-Agenten dieses Repository und SSH-Zugang zu deinem Server und sag:
„Setz Schreibzeug auf meinem Server auf, nach der [Installationsanleitung](https://firsttris.github.io/schreibzeug/installation.html).“

### 2. Manuell

Auf einem Server mit Docker (oder Podman), einer Domain, die auf ihn zeigt, und offenen Ports 80
und 443:

```bash
# Die Konfiguration (compose.yaml, .env.example, Caddyfile); die Programme kommen von Docker Hub
git clone https://github.com/firsttris/schreibzeug /opt/schreibzeug && cd /opt/schreibzeug
cp deploy/.env.example deploy/.env
nano deploy/.env                                          # Domain, Mail für Let's Encrypt, Version
docker compose -f deploy/compose.yaml up -d schreibzeug   # lädt Schreibzeug und startet es, vorerst nur auf dem Server selbst
```

Danach:

1. Das erste Konto über einen SSH-Tunnel anlegen (`ssh -L 3000:127.0.0.1:3000 <server>`, dann
   http://localhost:3000), bevor jemand anderes den Server erreicht.
2. Caddy dazu starten, der das HTTPS-Zertifikat holt: `docker compose -f deploy/compose.yaml up -d`.
3. `https://<deine Domain>` öffnen. Weitere Konten entstehen über Freigabe-Links oder, mit
   `SCHREIBZEUG_OPEN_SIGNUP=true` in `deploy/.env`, durch jeden.

Mit [Kontext](https://github.com/firsttris/kontext) braucht Schreibzeug keine eigene Installation:
Es kommt mit Kontext als dessen Dokumente. Nur auf dem eigenen Rechner ausprobieren:
`docker run -d -p 127.0.0.1:3000:3000 -v schreibzeug-data:/data tristanteu/schreibzeug`, dann
http://localhost:3000. Einstellungen, ein eigener Reverse Proxy, Backups und Updates stehen in der
[Installationsanleitung](https://firsttris.github.io/schreibzeug/installation.html) (Englisch).
Die Desktop-App beschreibt [Desktop-App](https://firsttris.github.io/schreibzeug/desktop.html); ihre Installer für Windows, macOS und Linux hängen an jedem [Release](https://github.com/firsttris/schreibzeug/releases).

## ✨ Funktionen

| | |
|---|---|
| 📝 **Dokumente** (.docx) | **Kommentare und Änderungsverfolgung**, Kopf- und Fußzeilen und Inhaltsverzeichnis, Rechtschreibprüfung auf Deutsch und Englisch, Vorlagen, **Serienbrief**, **E-Rechnungen** (ZUGFeRD), PDF und PDF/A · [mehr →](https://firsttris.github.io/schreibzeug/engine.html#mail-merge) |
| 📊 **Tabellen** (.xlsx) | Formeln, Zahlenformate, Sortieren und Filter, fixierte Zeilen, **Diagramme**, **Pivot-Tabellen**, Auswahllisten, bedingte Formatierung, CSV · [mehr →](https://firsttris.github.io/schreibzeug/engine.html#spreadsheets) |
| 📽️ **Präsentationen** (.pptx) | Folienlayouts, Formen, Designs, Übergänge, Sprechernotizen und eine **Bildschirmpräsentation** · [mehr →](https://firsttris.github.io/schreibzeug/engine.html#presentations) |
| 📄 **PDFs** | **Formulare ausfüllen und unterschreiben**, von Hand oder **digital** mit deinem Zertifikat (nicht qualifiziert), Notizen und Markieren, **Schwärzen**, Seiten einfügen und entfernen, **Texterkennung (OCR)** für Scans · [mehr →](https://firsttris.github.io/schreibzeug/pdf.html) |
| 🗒️ **Markdown & Text** (.md, .txt) | Eine **Live-Ansicht**, in der der Text Markdown bleibt, oder Quelle und Vorschau nebeneinander; Zeichenkodierung und Zeilenenden bleiben Byte für Byte · [mehr →](https://firsttris.github.io/schreibzeug/text.html) |
| 📁 **Dateien & Teamarbeit** | Ordner, Hochladen, zuletzt geöffnete Dateien und Papierkorb, **Versionen** zum Zurückholen, **Teilen** mit Konten oder per Link, **gemeinsam in Echtzeit** mit Cursorn · [mehr →](https://firsttris.github.io/schreibzeug/files.html) |
| 🤖 **KI & Kontext** | **MCP-Server** für Claude Code und andere MCP-Clients, mit deinen Rechten und mit Rückfrage, bevor er ein offenes Dokument ändert; **Anmeldung über [Kontext](https://github.com/firsttris/kontext)** und Schreibzeug als dessen Dokumente-Modul · [mehr →](https://firsttris.github.io/schreibzeug/mcp.html) |
| 🖥️ **Desktop-App** | **Windows, macOS und Linux** (Tauri): die Dateien in deinem Dokumente-Ordner ganz ohne Server, oder ein Fenster auf einen Schreibzeug-Server (noch nicht signiert) · [mehr →](https://firsttris.github.io/schreibzeug/desktop.html) |
| 🌐 **Deutsch und Englisch** | Die Oberfläche auf **Deutsch oder Englisch**, wie der Browser es wünscht oder in den Einstellungen gewählt · [mehr →](https://firsttris.github.io/schreibzeug/architecture.html#interface-texts) |
| ♿ **Barrierefreiheit** | Menüs und Werkzeugleisten per **Tastatur**, **Unterstützung für Screenreader** in Dokumenten, Tabellen und Präsentationen (nur wenn eingeschaltet, Strg+Alt+Z), automatisch gegen WCAG 2.2 AA geprüft · [mehr →](https://firsttris.github.io/schreibzeug/accessibility.html) |

## 📸 Screenshots

<table>
  <tr>
    <td><img src="docs/screenshots/files-light.png" alt="Dateiansicht von Schreibzeug: Ordner, Word-Dokumente, eine Tabelle und eine Präsentation mit letzter Änderung und Größe, Knöpfe für neuen Ordner, neue Datei und Hochladen"></td>
    <td><img src="docs/screenshots/spreadsheet-light.png" alt="Selbst gehosteter Tabelleneditor für .xlsx-Dateien im Browser: Werkzeugleiste, Formelzeile und Raster mit Blatt-Reitern"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/presentation-light.png" alt="Präsentationseditor für .pptx-Dateien: Folienliste links, die Titelfolie eines Vortrags und die Werkzeugleiste darüber"></td>
    <td><img src="docs/screenshots/pdf-light.png" alt="PDF-Editor im Browser: Werkzeuge zum Markieren, Zeichnen, für Notizen, Unterschrift und Schwärzen neben einem ausgefüllten Bestellformular"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/comments-light.png" alt="Kommentare neben einem Word-Dokument in Schreibzeug, mit Antworten"></td>
    <td><img src="docs/screenshots/share-light.png" alt="Einen Ordner mit einem anderen Konto oder per Link teilen, zum Bearbeiten oder Ansehen"></td>
  </tr>
</table>

## 🔀 Schreibzeug und die Alternativen

Schreibzeug ist für alle gemacht, die die Kompatibilität einer ausgereiften Office-Engine mit einer
Oberfläche wie bei heutigen Web-Apps wollen, auf dem eigenen Server.

| | Was es ist | Was Schreibzeug anders macht |
|---|---|---|
| [ONLYOFFICE Docs](https://github.com/ONLYOFFICE/DocumentServer) / [Euro-Office](https://github.com/Euro-Office) | Office-Engine fürs gemeinsame Arbeiten mit einer Oberfläche wie Microsoft Office, meist in Nextcloud eingebettet | Dieselbe Engine, eine neue Oberfläche, eigene Dateiverwaltung, kein Dokumentenserver |
| [Collabora Online](https://github.com/CollaboraOnline/online) | LibreOffice im Browser, am stärksten mit OpenDocument | Schwerpunkt auf den Microsoft-Formaten und einer modernen Oberfläche |
| [CryptPad](https://github.com/cryptpad/cryptpad) | Ende-zu-Ende verschlüsselte Suite fürs gemeinsame Arbeiten | Dateien bleiben einfache .docx, .xlsx und .pptx auf deinem Speicher |
| Microsoft 365 und andere | Office-Pakete in der Cloud | Selbst gehostet, Open Source, kein Preis pro Benutzer, deine Dateien unverändert |

## ❓ FAQ

<details>
<summary><b>Gibt es eine selbst gehostete Alternative zu Microsoft 365?</b></summary>

Ja. Schreibzeug läuft mit Docker auf deinem eigenen Server und bearbeitet Word-, Excel-, PowerPoint-
und PDF-Dateien im Browser, mehrere Leute gleichzeitig. Siehe [Installationsanleitung](https://firsttris.github.io/schreibzeug/installation.html).
</details>

<details>
<summary><b>Braucht es einen ONLYOFFICE Document Server oder Nextcloud?</b></summary>

Nein. Die Euro-Office-Engine läuft im Browser, der Schreibzeug-Server speichert die Dateien und
reicht die Änderungen weiter; sonst ist nichts zu installieren. Wie das geht, steht unter [Engine](https://firsttris.github.io/schreibzeug/engine.html).
</details>

<details>
<summary><b>Werden meine Dateien in ein anderes Format umgewandelt?</b></summary>

Nein. Eine .docx bleibt eine .docx, eine .xlsx eine .xlsx, eine .odt eine .odt; jedes Speichern ist
eine neue Version derselben Datei.
</details>

<details>
<summary><b>Kann ich Schreibzeug offline nutzen, ohne Server?</b></summary>

Ja, mit der Desktop-App für Windows, macOS und Linux: Sie öffnet die Dateien in deinem
Dokumente-Ordner direkt. Siehe [Desktop-App](https://firsttris.github.io/schreibzeug/desktop.html).
</details>

<details>
<summary><b>Können Claude oder andere KI-Assistenten meine Dokumente bearbeiten?</b></summary>

Ja, über den eingebauten MCP-Server und einen persönlichen Zugangsschlüssel, den du in den
Einstellungen anlegst. Ein Schlüssel lässt sich auf „Nur lesen“ beschränken; Änderungen an einem
offenen Dokument brauchen deine Zustimmung und lassen sich rückgängig machen. Siehe [MCP-Server](https://firsttris.github.io/schreibzeug/mcp.html).
</details>

<details>
<summary><b>Kann ich E-Rechnungen mit ZUGFeRD oder XRechnung erstellen?</b></summary>

ZUGFeRD ja: Eine Rechnung aus dem Texteditor wird ein ZUGFeRD-PDF/A-3 mit Factur-X-XML (EN 16931).
XRechnung wird gelesen und angezeigt, aber noch nicht erstellt. Siehe [E-Rechnungen](https://firsttris.github.io/schreibzeug/e-invoice.html).
</details>

<details>
<summary><b>Ist das sicher?</b></summary>

Prüf es selbst, der Code ist offen: Lass deinen Agenten Cloudflares [Security Audit Skill](https://github.com/cloudflare/security-audit-skill) oder
`/security-review` von Claude Code über dieses Repository laufen.
Sicherheitslücken meldest du vertraulich, wie in [SECURITY.md](SECURITY.md) beschrieben.
</details>

## 📚 Dokumentation

Die Dokumentation beginnt mit einem Rundgang in Bildern, gemacht zum Weiterschicken an Kunden: **[auf Deutsch](https://firsttris.github.io/schreibzeug/de/)** und **[auf Englisch](https://firsttris.github.io/schreibzeug/)**.

Die ganze Dokumentation (Englisch), mit Suche, steht unter **[firsttris.github.io/schreibzeug](https://firsttris.github.io/schreibzeug/)**:
[jede Funktion im Detail](https://firsttris.github.io/schreibzeug/overview.html), [Installation](https://firsttris.github.io/schreibzeug/installation.html), [Konten und Teilen](https://firsttris.github.io/schreibzeug/accounts.html),
[gemeinsames Bearbeiten](https://firsttris.github.io/schreibzeug/collaboration.html), [die Engine](https://firsttris.github.io/schreibzeug/engine.html) und
[Entwicklung](https://firsttris.github.io/schreibzeug/development.html). Was sich in jedem Release geändert hat, mit den Schritten,
die ein Update braucht: das [Changelog](CHANGELOG.md) (Englisch).

## 🛠️ Entwicklung

Braucht [Bun](https://bun.sh) 1.4 oder neuer, unter Linux x86_64 zum Vorbereiten der Engine; die Datenbank ist eine SQLite-Datei.

```bash
git clone https://github.com/firsttris/schreibzeug && cd schreibzeug
bun install
bun run dev              # http://localhost:5173, mit der API auf http://localhost:3000
```

Eine React-SPA mit TanStack Router und Query, Tailwind und Komponenten im Stil von shadcn; Euro-Office
`sdkjs` als Engine; ein Bun-Server mit Hono, Drizzle und SQLite; Tauri 3 (Alpha) für die Desktop-App.
Prüfungen, Tests und Architektur: [Entwicklung](https://firsttris.github.io/schreibzeug/development.html).

## 🧩 Mehr von uns

- Suchst du einen Ersatz für Gmail oder Google Workspace? **[Kontext](https://github.com/firsttris/kontext)**: Mail, Kalender, Kontakte, Chat und Telefonie für dein Team, auf deinem eigenen Server.
- Machst du deine Buchhaltung selbst? **[Haben](https://github.com/firsttris/haben)**: Rechnungen mit E-Rechnung, Belege, Bankabgleich und die Umsatzsteuer-Voranmeldung an ELSTER.

## 🤝 Mitmachen

Issues und Pull Requests sind willkommen. Bei einem Darstellungs- oder Kompatibilitätsfehler bitte
eine Datei anhängen, die ihn zeigt (oder eine kleine, die ihn nachstellt), und sagen, welches
Programm sie erstellt hat. Vor einem Pull Request bitte
`bun run lint && bun run typecheck && bun run test` ausführen; die Prüfungen, Konventionen und wie
Beiträge lizenziert werden, stehen in [CONTRIBUTING.md](CONTRIBUTING.md) (Englisch).
Sicherheitslücken bitte vertraulich melden ([SECURITY.md](SECURITY.md)).

---

<div align="center">

⭐ Gefällt dir Schreibzeug? Ein [Stern auf GitHub](https://github.com/firsttris/schreibzeug) hilft anderen, es zu finden.<br>
🐛 [Fehler melden](https://github.com/firsttris/schreibzeug/issues/new?template=bug_report.yml) · 💡 [Funktion vorschlagen](https://github.com/firsttris/schreibzeug/issues/new?template=feature_request.yml)

<sub>Lizenz: <a href="LICENSE">AGPL-3.0</a> · © Tristan Teufel und Mitwirkende · <a href="README.md">English version</a><br>
Wer eine veränderte Version weitergibt oder für andere betreibt, muss ihren Quellcode unter der AGPL anbieten; eine kommerzielle Lizenz ohne diese Pflichten gibt es über <a href="https://teufel-it.de">teufel-it.de</a>.<br>
Schreibzeug baut auf der Open-Source-Engine Euro-Office auf und steht in keiner Verbindung zu Euro-Office, ONLYOFFICE, Microsoft oder Google.</sub>

</div>
