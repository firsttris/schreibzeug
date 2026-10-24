import { useEffect, useState } from "react";

/** "Angebot.docx" → ["Angebot", ".docx"]: people rename the part before the extension. */
export const splitExtension = (name: string): [string, string] => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
};

export type FileTitleProps = {
  name: string;
  /** Stores a new name; absent when the user may not rename. Rejects with the reason. */
  onRename?: ((name: string) => Promise<unknown>) | undefined;
  onError: (message: string) => void;
};

/**
 * The file's name at the top, editable in place as in Google Docs: Enter or leaving the field
 * renames, Escape goes back. The extension stays as it is.
 */
export const FileTitle = ({ name, onRename, onError }: FileTitleProps) => {
  const [base, extension] = splitExtension(name);
  const [draft, setDraft] = useState(base);
  useEffect(() => setDraft(base), [base]);

  if (!onRename) {
    return <h1 className="m-0 truncate text-[15px] font-semibold">{base}</h1>;
  }
  const commit = async () => {
    const next = draft.trim();
    if (!next || next === base) return setDraft(base);
    try {
      await onRename(`${next}${extension}`);
    } catch (error) {
      setDraft(base);
      onError(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <input
      aria-label="Dateiname"
      value={draft}
      size={Math.max(4, draft.length)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(base);
          // The blur after Escape finds the old name and changes nothing.
          requestAnimationFrame(() => (event.target as HTMLInputElement).blur());
        }
      }}
      className="-mx-1 min-w-0 max-w-full truncate rounded-md border border-transparent bg-transparent px-1 text-[15px] font-semibold outline-none hover:border-[var(--border)] focus:border-[var(--foreground)]"
    />
  );
};
