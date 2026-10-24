import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

export type Shortcut = { keys: string; label: string };

/** Keys the engine itself handles (word/Editor/Shortcuts.js c_oAscDefaultShortcuts). */
export const WORD_SHORTCUTS: Shortcut[] = [
  { keys: "Strg+Z", label: "Rückgängig" },
  { keys: "Strg+Y", label: "Wiederholen" },
  { keys: "Strg+X / C / V", label: "Ausschneiden, Kopieren, Einfügen" },
  { keys: "Strg+A", label: "Alles auswählen" },
  { keys: "Strg+B", label: "Fett" },
  { keys: "Strg+I", label: "Kursiv" },
  { keys: "Strg+U", label: "Unterstrichen" },
  { keys: "Strg+,", label: "Hochgestellt" },
  { keys: "Strg+.", label: "Tiefgestellt" },
  { keys: "Strg+Leertaste", label: "Formatierung löschen" },
  { keys: "Strg+] / [", label: "Schrift größer, kleiner" },
  { keys: "Strg+L / E / R / J", label: "Links, zentriert, rechts, Blocksatz" },
  { keys: "Strg+Enter", label: "Seitenumbruch" },
  { keys: "Strg+K", label: "Link einfügen" },
  { keys: "Strg+F / H", label: "Suchen, Ersetzen" },
  { keys: "Strg+P", label: "Drucken" },
  { keys: "Strg+S", label: "Speichern" },
];

/** Keys of the spreadsheet, as its engine handles them (cell/view/WorkbookView.js, CellEditor). */
export const SHEET_SHORTCUTS: Shortcut[] = [
  { keys: "Strg+Z", label: "Rückgängig" },
  { keys: "Strg+Y", label: "Wiederholen" },
  { keys: "Strg+X / C / V", label: "Ausschneiden, Kopieren, Einfügen" },
  { keys: "Strg+B", label: "Fett" },
  { keys: "Strg+I", label: "Kursiv" },
  { keys: "Strg+U", label: "Unterstrichen" },
  { keys: "F2", label: "Zelle bearbeiten" },
  { keys: "Alt+Enter", label: "Zeilenumbruch in der Zelle" },
  { keys: "Strg+F", label: "Suchen" },
  { keys: "Strg+P", label: "Drucken" },
  { keys: "Strg+S", label: "Speichern" },
];

/** Keys of the presentation, as its engine handles them (slide/api.js, common shortcuts). */
export const SLIDE_SHORTCUTS: Shortcut[] = [
  { keys: "Strg+Z", label: "Rückgängig" },
  { keys: "Strg+Y", label: "Wiederholen" },
  { keys: "Strg+X / C / V", label: "Ausschneiden, Kopieren, Einfügen" },
  { keys: "Strg+A", label: "Alles auswählen" },
  { keys: "Strg+B", label: "Fett" },
  { keys: "Strg+I", label: "Kursiv" },
  { keys: "Strg+U", label: "Unterstrichen" },
  { keys: "Strg+M", label: "Neue Folie" },
  { keys: "Strg+F / H", label: "Suchen, Ersetzen" },
  { keys: "Strg+P", label: "Drucken" },
  { keys: "Strg+S", label: "Speichern" },
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
  <Dialog open={open} title="Tastenkürzel" onClose={onClose}>
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
        Schließen
      </Button>
    </div>
  </Dialog>
);

/** The running source, as the AGPL asks of a program used over a network. */
export const SOURCE_URL = "https://github.com/firsttris/schreibzeug";

export const AboutDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Dialog open={open} title="Über Schreibzeug" onClose={onClose}>
    <p className="m-0 text-sm">
      Schreibzeug ist freie Software unter der GNU Affero General Public License 3.0, einschließlich der
      Engine, die die Dokumente bearbeitet. Du kannst den Quellcode der laufenden Version einsehen, ändern und
      weitergeben.
    </p>
    <p className="m-0 text-sm">
      Quellcode:{" "}
      <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="text-[var(--foreground)] underline">
        {SOURCE_URL.replace("https://", "")}
      </a>
    </p>
    <div className="flex justify-end">
      <Button variant="outline" onClick={onClose}>
        Schließen
      </Button>
    </div>
  </Dialog>
);
