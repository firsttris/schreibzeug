import type { CoreState, OpenedDocument } from "@schreibzeug/editor-core";
import type { BlankFormat } from "@schreibzeug/files-api";
import { NEW_FILE_GROUPS, NEW_FILES } from "../files/new-files";
import { keys } from "../lib/keys";
import { m } from "../paraglide/messages";
import type { MenuItem } from "../ui/menu";
import type { Menu } from "../ui/menu-bar";

/**
 * What the "Datei" menu does with the file on the server. The edit page provides these
 * (use-file-actions.tsx); an action that is absent is not offered, e.g. sharing to anyone but
 * the owner.
 */
export type FileActions = {
  /** Opens the name dialog for a new file of this format, in a new tab. */
  onNew: (format: BlankFormat) => void;
  onCopy: () => void;
  onShare?: (() => void) | undefined;
  onShowVersions?: (() => void) | undefined;
  onClose: () => void;
};

/**
 * What the open document offers besides the file itself: a PDF to download or print, and a PDF/A
 * for archiving. A PDF needs no second PDF to download.
 */
export type PdfActions = { download?: () => void; downloadPdfA: () => void; print: () => void } | null;

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
  label: m.common_file(),
  groups: [
    ...NEW_FILE_GROUPS.map((group) =>
      group.map((format) => ({ label: NEW_FILES[format].title, onSelect: () => actions.onNew(format) })),
    ),
    [
      { label: m.file_menu_make_copy(), onSelect: actions.onCopy },
      { label: m.file_menu_download(), onSelect: download, disabled: !ready },
      ...downloads.map((item) => ({ ...item, disabled: item.disabled || !ready })),
      ...(pdf?.download
        ? [{ label: m.file_menu_download_pdf(), onSelect: pdf.download, disabled: !ready }]
        : []),
      ...(pdf ? [{ label: m.file_menu_download_pdfa(), onSelect: pdf.downloadPdfA, disabled: !ready }] : []),
      ...(pdf
        ? [{ label: m.common_print(), shortcut: keys("Ctrl+P"), onSelect: pdf.print, disabled: !ready }]
        : []),
    ],
    [
      ...(actions.onShare ? [{ label: m.file_menu_share(), onSelect: actions.onShare }] : []),
      ...(actions.onShowVersions
        ? [{ label: m.file_menu_versions(), onSelect: actions.onShowVersions }]
        : []),
    ],
    [{ label: m.common_close(), onSelect: actions.onClose }],
  ],
});

/** The engine reading the document out to a screen reader, where the editor has it. */
export type ScreenReaderSwitch = { on: boolean; set: (on: boolean) => void };

export const screenReaderSwitch = (
  editor: Pick<OpenedDocument<CoreState>, "setScreenReader"> | null,
  state: Pick<CoreState, "screenReader">,
): ScreenReaderSwitch | null => (editor ? { on: state.screenReader, set: editor.setScreenReader } : null);

/** The "Hilfe" menu, with the screen reader switch where the editor has one (also Strg+Alt+Z). */
export const helpMenu = (
  open: (dialog: "shortcuts" | "about") => void,
  screenReader: ScreenReaderSwitch | null = null,
): Menu => ({
  label: m.common_help(),
  groups: [
    [
      { label: m.file_menu_shortcuts(), onSelect: () => open("shortcuts") },
      ...(screenReader
        ? [
            {
              label: m.file_menu_screen_reader(),
              shortcut: keys("Ctrl+Alt+Z"),
              checked: screenReader.on,
              onSelect: () => screenReader.set(!screenReader.on),
            },
          ]
        : []),
      { label: m.file_menu_about(), onSelect: () => open("about") },
    ],
  ],
});
