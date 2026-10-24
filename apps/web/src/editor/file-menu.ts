import type { OfficeFormat } from "@schreibzeug/editor-core";
import type { MenuItem } from "../ui/menu";
import type { Menu } from "../ui/menu-bar";

/**
 * What the "Datei" menu does with the file on the server. The edit page provides these
 * (use-file-actions.tsx); an action that is absent is not offered, e.g. sharing to anyone but
 * the owner.
 */
export type FileActions = {
  /** Opens the name dialog for a new file of this format, in a new tab. */
  onNew: (format: OfficeFormat) => void;
  onCopy: () => void;
  onShare?: (() => void) | undefined;
  onShowVersions?: (() => void) | undefined;
  onClose: () => void;
};

const NEW_ITEMS: Array<{ format: OfficeFormat; label: string }> = [
  { format: "docx", label: "Neues Dokument" },
  { format: "xlsx", label: "Neue Tabelle" },
  { format: "pptx", label: "Neue Präsentation" },
];

/** What the open document offers besides the file itself: a PDF to download or print. */
export type PdfActions = { download: () => void; print: () => void } | null;

/**
 * The "Datei" menu, the same in every editor; `download` saves the open state as a file, `pdf`
 * makes a PDF of it where the editor can.
 */
export const fileMenu = (
  actions: FileActions,
  download: () => void,
  pdf: PdfActions,
  ready: boolean,
  /** Further formats to download in, e.g. a spreadsheet as CSV. */
  downloads: MenuItem[] = [],
): Menu => ({
  label: "Datei",
  groups: [
    NEW_ITEMS.map(({ format, label }) => ({ label, onSelect: () => actions.onNew(format) })),
    [
      { label: "Kopie erstellen", onSelect: actions.onCopy },
      { label: "Herunterladen", onSelect: download, disabled: !ready },
      ...downloads.map((item) => ({ ...item, disabled: item.disabled || !ready })),
      ...(pdf
        ? [
            { label: "Als PDF herunterladen", onSelect: pdf.download, disabled: !ready },
            { label: "Drucken", shortcut: "Strg+P", onSelect: pdf.print, disabled: !ready },
          ]
        : []),
    ],
    [
      ...(actions.onShare ? [{ label: "Teilen …", onSelect: actions.onShare }] : []),
      ...(actions.onShowVersions ? [{ label: "Versionen …", onSelect: actions.onShowVersions }] : []),
    ],
    [{ label: "Schließen", onSelect: actions.onClose }],
  ],
});

/** The "Hilfe" menu. */
export const helpMenu = (open: (dialog: "shortcuts" | "about") => void): Menu => ({
  label: "Hilfe",
  groups: [
    [
      { label: "Tastenkürzel", onSelect: () => open("shortcuts") },
      { label: "Über Schreibzeug", onSelect: () => open("about") },
    ],
  ],
});
