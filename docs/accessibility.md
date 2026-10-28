---
description: >-
  Accessibility in Schreibzeug: WCAG 2.2 AA as the goal for the interface, the engine's screen
  reader support (off unless switched on, Strg+Alt+Z), keyboard use, how it is checked and where a
  document drawn on a canvas falls short.
---

# Accessibility

Schreibzeug should be usable with a screen reader, with the keyboard alone and with large text. The
goal is **WCAG 2.2 level AA**, the core of the European standard EN 301 549 and of the German BITV
2.0 for public bodies. The interface around the document meets the automatic checks of it; the
document itself is drawn on a canvas by the engine, which sets limits described below.

## The interface

- Every button without text has a name ("Fett", "Kommentare"), icons beside text are hidden from
  screen readers, and messages such as "Gespeichert" or an error are read out (`role="status"`,
  `role="alert"`). The page is marked as German.
- **Menu bar** as the [ARIA menu bar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/)
  has it: left and right go along the menus (and switch an open one), Enter, Space or down open a
  menu at its first entry, up and down go through it, Home and End to the first and last, Escape
  back to the menu bar (`src/ui/menu-bar.tsx`, `src/ui/menu-keys.ts`).
- **Keyboard shortcuts** of each editor are under *Hilfe → Tastenkürzel*.
- The engine's input has the file's name, so a screen reader says which document has the focus.

## Screen reader support

The engine can read out what happens in the document (`common/workerspeech.js`): it writes into an
`aria-live` region beside its input, which a screen reader announces. **It is off unless switched
on**, under *Hilfe → Unterstützung für Screenreader* or with **Strg+Alt+Z** in the document (on a
Mac also Strg+Umschalt+Z). Off, the engine does not even listen for it, so it costs nothing; on, it
compares the selection once per cursor move. The choice is kept in the browser
(`schreibzeug.screenreader`), as web-apps keeps it.

What it reads:

| | |
| --- | --- |
| Text documents | with the arrow keys the character, with Strg the word, up and down the line; a selection with "ausgewählt" |
| Spreadsheets | the cell's value and address, a selected range from its first to its last cell, the sheet on switching |
| Presentations | the slide's number, a selected object with its alternative text |
| Pictures and shapes | their kind, text, title and description (alternative text) |

The words around the text ("ausgewählt", "leere Zelle", "Folie") are German
(`packages/editor-core/src/screen-reader.ts`); the engine would say them in English.

## How it is checked

`e2e/accessibility.spec.ts` checks the sign-in, the file list and every editor (document,
spreadsheet, presentation, note) with [axe-core](https://github.com/dequelabs/axe-core) against the
rules of WCAG 2.2 AA, in light and dark; a single violation fails it. It also goes through the menu
bar with the keyboard and checks that the screen reader support reads a selection out in German,
is remembered and follows Strg+Alt+Z. The other end-to-end tests find elements as a screen reader
does, by role and name.

A machine finds only part of the problems: whether a label makes sense and a task can be done with
a screen reader needs a person.

## Where it falls short

- **The document is a canvas.** A screen reader hears what the engine announces, but cannot browse
  the document: no reading mode, no "read all", no jumping between headings. Headings, list levels
  and the place in a table are not announced, nor is typed text.
- **PDFs** are read out not at all; the engine has no descriptions for them.
- **Alternative text** that a document brings is read out and kept on saving; there is no dialog yet
  to add it to a picture.
- **Exported PDFs** are not tagged (PDF/UA).
- A full run with NVDA, VoiceOver and TalkBack is still to be done.

For an accessibility statement this means "partially conformant", with the points above as the
content that is not accessible.
