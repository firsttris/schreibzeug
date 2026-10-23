import { FolderOpen, Layers } from "lucide-react";
import { useState } from "react";
import { EditorView } from "./editor-view";
import { type OpenedFile, readFile } from "./files";

export const App = () => {
  const [file, setFile] = useState<OpenedFile | null>(null);

  if (file) return <EditorView file={file} onClose={() => setFile(null)} />;

  return (
    <main className="flex h-full items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]">
          <Layers size={24} />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-2xl font-semibold tracking-tight">Stapel</h1>
          <p className="m-0 text-sm text-[var(--muted-foreground)]">
            Öffne ein Word-Dokument. Es wird im Browser bearbeitet und als .docx gespeichert.
          </p>
        </div>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-[var(--primary)] px-5 text-sm font-medium text-[var(--primary-foreground)] focus-within:outline-2 focus-within:outline-offset-2">
          <FolderOpen size={16} />
          Dokument öffnen
          <input
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            data-testid="open-file"
            className="sr-only"
            onChange={async (event) => {
              const chosen = event.target.files?.[0];
              if (chosen) setFile(await readFile(chosen));
            }}
          />
        </label>
      </div>
    </main>
  );
};
