import {
  ENCODING_LABEL,
  LINE_ENDING_LABEL,
  markdownHtml,
  TEXT_COMMANDS,
  type TextCommand,
  type TextEditorState,
  type TextForm,
} from "@schreibzeug/text-editor";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { SizeGrid } from "../toolbar/table-menu";
import { TextToolbar } from "../toolbar/text-toolbar";
import { Dialog } from "../ui/dialog";
import { useNotice } from "../ui/use-notice";
import { ConflictDialog } from "./conflict-dialog";
import { EditorHeader } from "./editor-header";
import type { FileActions } from "./file-menu";
import { LinkDialog } from "./link-dialog";
import { downloadBytes } from "./opened-file";
import { TEXT_SHORTCUTS, textMenus } from "./text-menus";
import { useTextEditor } from "./use-text-editor";
import type { TextFile } from "./use-text-file";
import { textBytes, useTextSave } from "./use-text-save";
import { useViewMode } from "./use-view-mode";
import "./text-view.css";

export type TextViewProps = {
  file: TextFile;
  name: string;
  markdown: boolean;
  readOnly: boolean;
  /** Stores the bytes as the newest version, made over the one with that SHA-256. */
  onStore: (bytes: Uint8Array, over: string) => Promise<unknown>;
  fileActions: FileActions;
  onRename?: ((name: string) => Promise<unknown>) | undefined;
  /** Opens the newest version in place of this text. */
  onReload: () => void;
  /** Keeps these bytes as a new file beside this one and opens it. */
  onSaveCopy: (bytes: Uint8Array) => Promise<void>;
};

const MIME = { markdown: "text/markdown", plain: "text/plain" } as const;

/** Where the cursor is and what the file keeps of its form: encoding and line endings. */
const StatusBar = ({
  state,
  form,
  markdown,
}: {
  state: TextEditorState;
  form: TextForm;
  markdown: boolean;
}) => (
  <footer
    data-testid="text-status"
    className="flex shrink-0 justify-end gap-5 border-t border-[var(--border)] px-4 py-1.5 text-xs text-[var(--muted-foreground)] tabular-nums"
  >
    <span>
      Zeile {state.line}, Spalte {state.column}
    </span>
    <span title="Zeichenkodierung">
      {ENCODING_LABEL[form.encoding]}
      {form.bom ? " mit BOM" : ""}
    </span>
    <span title="Zeilenende">{LINE_ENDING_LABEL[form.lineEnding]}</span>
    <span>{markdown ? "Markdown" : "Text"}</span>
  </footer>
);

/** The split view's right side: the Markdown as it reads, from the same parser as the editor. */
const Preview = ({ text }: { text: string }) => {
  const deferred = useDeferredValue(text);
  const html = useMemo(() => markdownHtml(deferred), [deferred]);
  return (
    <section
      aria-label="Vorschau"
      data-testid="text-preview"
      className="text-preview min-w-0 overflow-y-auto px-8 py-6"
      // markdownHtml escapes every text and keeps only safe link targets (preview.ts).
      // biome-ignore lint/security/noDangerouslySetInnerHtml: built from escaped parts, no raw HTML
      dangerouslySetInnerHTML={{ __html: html }}
    ></section>
  );
};

/** A Markdown note or a plain text file: title and menus, the toolbar, the text, its status. */
export const TextView = ({
  file,
  name,
  markdown,
  readOnly,
  onStore,
  fileActions,
  onRename,
  onReload,
  onSaveCopy,
}: TextViewProps) => {
  const container = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useViewMode(markdown);
  const saveRef = useRef<() => void>(() => {});
  const { editor, state, text, revision } = useTextEditor(container, {
    text: file.text,
    markdown,
    readOnly,
    mode,
    onSave: () => saveRef.current(),
  });
  const saving = useTextSave({
    editor,
    form: file.form,
    openedSha256: file.sha256,
    modified: { value: state.modified, revision },
    readOnly,
    store: onStore,
  });
  saveRef.current = () => void saving.save();
  const [notice, notify] = useNotice();
  const [linkText, setLinkText] = useState<string | null>(null);
  const [tableDialog, setTableDialog] = useState(false);

  const run = (command: TextCommand) => editor?.run(command);
  const bytesNow = () => {
    const encoded = textBytes(editor?.text() ?? file.text, file.form);
    if (!encoded.ok) notify(encoded.message);
    return encoded.ok ? encoded.bytes : null;
  };
  const download = () => {
    const bytes = bytesNow();
    if (bytes) downloadBytes(bytes, name, markdown ? MIME.markdown : MIME.plain);
  };
  const context = {
    state,
    markdown,
    readOnly,
    mode,
    onMode: setMode,
    run,
    onUndo: () => editor?.undo(),
    onRedo: () => editor?.redo(),
    onFind: () => editor?.find(),
    onLink: () => setLinkText(editor?.selection() ?? ""),
    onTable: () => setTableDialog(true),
  };

  return (
    <div className="flex h-full flex-col">
      <EditorHeader
        name={name}
        format={markdown ? "md" : "txt"}
        document={{ status: editor ? "ready" : "loading", modified: state.modified, connected: true }}
        failure={null}
        saving={saving}
        ready={editor !== null}
        readOnly={readOnly}
        file={fileActions}
        onRename={onRename}
        onDownload={download}
        menus={textMenus(context)}
        shortcuts={TEXT_SHORTCUTS}
        notice={notice}
        // A plain text file has nothing to format; undo and redo are in "Bearbeiten".
        toolbar={markdown ? <TextToolbar {...context} disabled={editor === null} /> : null}
      />
      <div
        className={`min-h-0 flex-1 ${mode === "split" && markdown ? "grid grid-cols-2" : "flex"}`}
        data-mode={markdown ? mode : "plain"}
      >
        <div
          ref={container}
          data-testid="text-editor"
          className={`text-editor min-w-0 flex-1 overflow-hidden ${markdown ? `text-editor-${mode}` : "text-editor-plain"}`}
        />
        {markdown && mode === "split" && <Preview text={text} />}
      </div>
      <StatusBar state={state} form={file.form} markdown={markdown} />
      <ConflictDialog
        open={saving.asking}
        onClose={saving.dismiss}
        onReload={onReload}
        onSaveCopy={async () => {
          const bytes = bytesNow();
          if (bytes) await onSaveCopy(bytes);
        }}
      />
      <LinkDialog
        draft={
          linkText === null
            ? null
            : {
                link: { url: "", text: linkText },
                existing: false,
                apply: ({ url, text: label }) => run(TEXT_COMMANDS.link(url, label)),
              }
        }
        onClose={() => setLinkText(null)}
      />
      <Dialog open={tableDialog} title="Tabelle einfügen" onClose={() => setTableDialog(false)}>
        <SizeGrid
          onPick={({ columns, rows }) => {
            run(TEXT_COMMANDS.table(columns, rows));
            setTableDialog(false);
          }}
        />
      </Dialog>
    </div>
  );
};
