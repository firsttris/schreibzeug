/**
 * Texts the engine draws itself (placeholders, empty states, chart defaults), which it looks up in
 * the `translate` map its API is created with (the keys are its English texts). German, as the app.
 */
export const SLIDE_TEXTS: Record<string, string> = {
  "Click to add first slide": "Klicken, um die erste Folie hinzuzufügen",
  "Click to add notes": "Klicken, um Notizen hinzuzufügen",
  "Slide title": "Folientitel",
  "Slide subtitle": "Untertitel",
  "Slide text": "Folientext",
  "Your text here": "Text hier eingeben",
  "Slide number": "Foliennummer",
  "Date and time": "Datum und Uhrzeit",
  Header: "Kopfzeile",
  Footer: "Fußzeile",
  Chart: "Diagramm",
  Table: "Tabelle",
  Image: "Bild",
  Picture: "Bild",
  Media: "Medien",
  "Diagram Title": "Diagrammtitel",
  Series: "Reihe",
  "X Axis": "X-Achse",
  "Y Axis": "Y-Achse",
};

/**
 * The spreadsheet's texts: the captions of a pivot table (cell/model/PivotTables.js
 * GRAND_TOTAL_CAPTION, ROW_HEADER_CAPTION, …), named as German Excel names them. A value's name is
 * set by the app ("Summe von Betrag", cell-pivot.ts), since the engine fills in "Sum" untranslated.
 */
export const CELL_TEXTS: Record<string, string> = {
  "Grand Total": "Gesamtergebnis",
  "Row Labels": "Zeilenbeschriftungen",
  "Column Labels": "Spaltenbeschriftungen",
  Values: "Werte",
  "(All)": "(Alle)",
  "(Multiple Items)": "(Mehrere Elemente)",
  "(blank)": "(Leer)",
  "%1 of %2": "%1 von %2",
};
