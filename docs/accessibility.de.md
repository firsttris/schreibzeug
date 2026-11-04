---
description: >-
  Barrierefreiheit in Schreibzeug: WCAG 2.2 AA als Ziel für die Oberfläche, die
  Screenreader-Unterstützung der Engine (aus, solange nicht eingeschaltet, Strg+Alt+Z), Bedienung per
  Tastatur, wie es geprüft wird und wo ein auf einen Canvas gezeichnetes Dokument an Grenzen stößt.
---

# Barrierefreiheit { #accessibility }

Schreibzeug soll mit einem Screenreader, allein mit der Tastatur und mit großer Schrift benutzbar
sein. Das Ziel ist **WCAG 2.2 Stufe AA**, der Kern der europäischen Norm EN 301 549 und der
deutschen BITV 2.0 für öffentliche Stellen. Die Oberfläche um das Dokument besteht deren
automatische Prüfungen; das Dokument selbst zeichnet die Engine auf einen Canvas, was Grenzen
setzt, die unten beschrieben sind.

## Die Oberfläche { #the-interface }

- Jeder Button ohne Text hat einen Namen („Fett“, „Kommentare“), Icons neben Text sind vor
  Screenreadern verborgen, und Meldungen wie „Gespeichert“ oder ein Fehler werden vorgelesen
  (`role="status"`, `role="alert"`). Die Seite ist als Deutsch ausgezeichnet.
- **Menüleiste** nach dem [ARIA-Menüleisten-Muster](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/):
  Links und rechts gehen die Menüs entlang (und wechseln ein offenes), Enter, Leertaste oder unten
  öffnen ein Menü bei seinem ersten Eintrag, oben und unten gehen hindurch, Pos1 und Ende zum ersten
  und letzten, Escape zurück zur Menüleiste (`src/ui/menu-bar.tsx`, `src/ui/menu-keys.ts`).
- **F6 und Umschalt+F6** wechseln zwischen dem Dokument, der Menüleiste und der Werkzeugleiste, wie
  in Word und LibreOffice. Im Dokument ist Tab ein Tabulator (eine Zelle, ein Formularfeld), also
  ist F6 der Weg hinaus; er führt zurück zum Cursor, wo er war.
- **Werkzeugleisten** sind je ein Halt für Tab, wie es das
  [ARIA-Toolbar-Muster](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/) vorsieht: Tab erreicht
  den zuletzt genutzten Button, die Pfeiltasten, Pos1 und Ende gehen die Buttons entlang; Listen wie
  die Schriftart behalten ihren eigenen Halt und ihre Pfeiltasten (`src/ui/roving-toolbar.ts`).
- Die **Tastenkürzel** jedes Editors stehen unter *Hilfe → Tastenkürzel*.
- Die Eingabe der Engine trägt den Namen der Datei, sodass ein Screenreader sagt, welches Dokument
  den Fokus hat.

## Screenreader-Unterstützung { #screen-reader-support }

Die Engine kann vorlesen, was im Dokument geschieht (`common/workerspeech.js`): Sie schreibt in
einen `aria-live`-Bereich neben ihrer Eingabe, den ein Screenreader ansagt. **Sie ist aus, solange
sie nicht eingeschaltet wird**, unter *Hilfe → Unterstützung für Screenreader* oder mit
**Strg+Alt+Z** im Dokument (auf einem Mac auch Strg+Umschalt+Z). Ausgeschaltet hört die Engine nicht
einmal darauf, es kostet also nichts; eingeschaltet vergleicht sie die Auswahl einmal pro
Cursorbewegung. Die Wahl wird im Browser gespeichert (`schreibzeug.screenreader`), wie web-apps sie
speichert.

Was sie vorliest:

| | |
| --- | --- |
| Textdokumente | mit den Pfeiltasten das Zeichen, mit Strg das Wort, oben und unten die Zeile; eine Auswahl mit „ausgewählt“ |
| Tabellen | Wert und Adresse der Zelle, einen ausgewählten Bereich von seiner ersten bis zu seiner letzten Zelle, das Blatt beim Wechsel |
| Präsentationen | die Nummer der Folie, ein ausgewähltes Objekt mit seinem Alternativtext |
| Bilder und Formen | ihre Art, Text, Titel und Beschreibung (Alternativtext) |

Die Wörter um den Text („ausgewählt“, „leere Zelle“, „Folie“) sind Deutsch
(`packages/editor-core/src/screen-reader.ts`); die Engine würde sie auf Englisch sagen.

## Wie es geprüft wird { #how-it-is-checked }

`e2e/accessibility.spec.ts` prüft die Anmeldung, die Dateiliste und jeden Editor (Dokument,
Tabelle, Präsentation, Notiz) mit [axe-core](https://github.com/dequelabs/axe-core) gegen die Regeln
von WCAG 2.2 AA, hell und dunkel; ein einziger Verstoß lässt es scheitern. Es geht außerdem mit der
Tastatur durch die Menüleiste und prüft, dass die Screenreader-Unterstützung eine Auswahl auf
Deutsch vorliest, gemerkt wird und auf Strg+Alt+Z reagiert, dass F6 aus einem Dokument und einer
Tabelle hinaus und wieder zurück führt und dass eine Werkzeugleiste ein Halt für Tab ist. Die
anderen End-to-End-Tests finden Elemente so, wie ein Screenreader es tut, nach Rolle und Name.

Eine Maschine findet nur einen Teil der Probleme: Ob eine Beschriftung Sinn ergibt und eine Aufgabe
mit einem Screenreader zu erledigen ist, braucht einen Menschen.

## Wo es an Grenzen stößt { #where-it-falls-short }

- **Das Dokument ist ein Canvas.** Ein Screenreader hört, was die Engine ansagt, kann aber nicht
  durch das Dokument browsen: kein Lesemodus, kein „alles vorlesen“, kein Springen zwischen
  Überschriften. Überschriften, Listenebenen und die Position in einer Tabelle werden nicht
  angesagt, getippter Text auch nicht.
- **PDFs** werden gar nicht vorgelesen; die Engine hat für sie keine Beschreibungen.
- **Alternativtext**, den ein Dokument mitbringt, wird vorgelesen und beim Speichern erhalten; es
  gibt noch keinen Dialog, um ihn zu einem Bild hinzuzufügen.
- **Exportierte PDFs** sind nicht getaggt (PDF/UA).
- Ein vollständiger Durchgang mit NVDA, VoiceOver und TalkBack steht noch aus.

Für eine Erklärung zur Barrierefreiheit heißt das „teilweise konform“, mit den Punkten oben als den
Inhalten, die nicht barrierefrei sind.
