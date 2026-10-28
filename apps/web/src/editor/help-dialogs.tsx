import { keys } from "../lib/keys";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

export type Shortcut = { keys: string; label: string };

/** Keys the engine itself handles (word/Editor/Shortcuts.js c_oAscDefaultShortcuts). */
export const WORD_SHORTCUTS: Shortcut[] = [
  { keys: keys("Ctrl+Z"), label: m.common_undo() },
  { keys: keys("Ctrl+Y"), label: m.common_redo() },
  { keys: keys("Ctrl+X / C / V"), label: m.help_dialogs_cut_copy_paste() },
  { keys: keys("Ctrl+A"), label: m.common_select_all() },
  { keys: keys("Ctrl+B"), label: m.common_bold() },
  { keys: keys("Ctrl+I"), label: m.common_italic() },
  { keys: keys("Ctrl+U"), label: m.common_underline() },
  { keys: keys("Ctrl+,"), label: m.help_dialogs_superscript() },
  { keys: keys("Ctrl+."), label: m.help_dialogs_subscript() },
  { keys: keys("Ctrl+Space"), label: m.help_dialogs_clear_formatting() },
  { keys: keys("Ctrl+] / ["), label: m.help_dialogs_font_size() },
  { keys: keys("Ctrl+L / E / R / J"), label: m.help_dialogs_alignment() },
  { keys: keys("Ctrl+Enter"), label: m.help_dialogs_page_break() },
  { keys: keys("Ctrl+K"), label: m.help_dialogs_insert_link() },
  { keys: keys("Ctrl+F / H"), label: m.help_dialogs_find_replace() },
  { keys: keys("Ctrl+P"), label: m.common_print() },
  { keys: keys("Ctrl+S"), label: m.common_save() },
  { keys: keys("F6 / Shift+F6"), label: m.help_dialogs_cycle_focus() },
  { keys: keys("Ctrl+Alt+Z"), label: m.help_dialogs_screen_reader() },
];

/** Keys of the spreadsheet, as its engine handles them (cell/view/WorkbookView.js, CellEditor). */
export const SHEET_SHORTCUTS: Shortcut[] = [
  { keys: keys("Ctrl+Z"), label: m.common_undo() },
  { keys: keys("Ctrl+Y"), label: m.common_redo() },
  { keys: keys("Ctrl+X / C / V"), label: m.help_dialogs_cut_copy_paste() },
  { keys: keys("Ctrl+B"), label: m.common_bold() },
  { keys: keys("Ctrl+I"), label: m.common_italic() },
  { keys: keys("Ctrl+U"), label: m.common_underline() },
  { keys: keys("F2"), label: m.help_dialogs_edit_cell() },
  { keys: keys("Alt+Enter"), label: m.help_dialogs_cell_line_break() },
  { keys: keys("Ctrl+F"), label: m.common_find() },
  { keys: keys("Ctrl+P"), label: m.common_print() },
  { keys: keys("Ctrl+S"), label: m.common_save() },
  { keys: keys("F6 / Shift+F6"), label: m.help_dialogs_cycle_focus() },
  { keys: keys("Ctrl+Alt+Z"), label: m.help_dialogs_screen_reader() },
];

/** Keys of the presentation, as its engine handles them (slide/api.js, common shortcuts). */
export const SLIDE_SHORTCUTS: Shortcut[] = [
  { keys: keys("Ctrl+Z"), label: m.common_undo() },
  { keys: keys("Ctrl+Y"), label: m.common_redo() },
  { keys: keys("Ctrl+X / C / V"), label: m.help_dialogs_cut_copy_paste() },
  { keys: keys("Ctrl+A"), label: m.common_select_all() },
  { keys: keys("Ctrl+B"), label: m.common_bold() },
  { keys: keys("Ctrl+I"), label: m.common_italic() },
  { keys: keys("Ctrl+U"), label: m.common_underline() },
  { keys: keys("Ctrl+M"), label: m.help_dialogs_new_slide() },
  { keys: keys("Ctrl+F / H"), label: m.help_dialogs_find_replace() },
  { keys: keys("Ctrl+P"), label: m.common_print() },
  { keys: keys("Ctrl+S"), label: m.common_save() },
  { keys: keys("F6 / Shift+F6"), label: m.help_dialogs_cycle_focus() },
  { keys: keys("Ctrl+Alt+Z"), label: m.help_dialogs_screen_reader() },
];

export const PDF_SHORTCUTS: Shortcut[] = [
  { keys: keys("Ctrl+Z"), label: m.common_undo() },
  { keys: keys("Ctrl+Y"), label: m.common_redo() },
  { keys: keys("Ctrl+C"), label: m.common_copy() },
  { keys: keys("Del"), label: m.help_dialogs_delete_annotation() },
  { keys: keys("Ctrl+P"), label: m.common_print() },
  { keys: keys("Ctrl+S"), label: m.common_save() },
  { keys: keys("F6 / Shift+F6"), label: m.help_dialogs_cycle_focus() },
];

export const ShortcutsDialog = ({
  open,
  shortcuts,
  onClose,
}: {
  open: boolean;
  shortcuts: Shortcut[];
  onClose: () => void;
}) => (
  <Dialog open={open} title={m.help_dialogs_shortcuts_title()} onClose={onClose}>
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
      {shortcuts.map(({ keys, label }) => (
        <div key={keys} className="contents">
          <dt className="font-mono text-xs leading-5 text-[var(--muted-foreground)]">{keys}</dt>
          <dd className="m-0">{label}</dd>
        </div>
      ))}
    </dl>
    <div className="flex justify-end">
      <Button variant="outline" onClick={onClose}>
        {m.common_close()}
      </Button>
    </div>
  </Dialog>
);

/** The running source, as the AGPL asks of a program used over a network. */
export const SOURCE_URL = "https://github.com/firsttris/schreibzeug";

export const AboutDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Dialog open={open} title={m.help_dialogs_about_title()} onClose={onClose}>
    <p className="m-0 text-sm">{m.help_dialogs_about_text()}</p>
    <p className="m-0 text-sm">
      {m.help_dialogs_source_code()}{" "}
      <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="text-[var(--foreground)] underline">
        {SOURCE_URL.replace("https://", "")}
      </a>
    </p>
    <div className="flex justify-end">
      <Button variant="outline" onClick={onClose}>
        {m.common_close()}
      </Button>
    </div>
  </Dialog>
);
