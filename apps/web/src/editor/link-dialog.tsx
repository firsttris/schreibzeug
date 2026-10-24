import type { LinkDraft } from "@schreibzeug/editor-core";
import { useState } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

export type LinkDialogProps = {
  /** What the dialog edits; null closes it. */
  draft: LinkDraft | null;
  onClose: () => void;
};

const inputClass =
  "h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--foreground)]";

/** Address and text of a link, as web-apps' hyperlink dialog asks for them (without bookmarks). */
export const LinkDialog = ({ draft, onClose }: LinkDialogProps) => (
  <Dialog
    open={draft !== null}
    title={draft?.existing ? "Link bearbeiten" : "Link einfügen"}
    onClose={onClose}
  >
    {draft && <LinkForm draft={draft} onClose={onClose} />}
  </Dialog>
);

const LinkForm = ({ draft, onClose }: { draft: LinkDraft; onClose: () => void }) => {
  const [url, setUrl] = useState(draft.link.url);
  const [text, setText] = useState(draft.link.text);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        draft.apply({ url, text });
        onClose();
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Adresse</span>
        <input
          // biome-ignore lint/a11y/noAutofocus: the dialog exists to type this address
          autoFocus
          required
          value={url}
          placeholder="https://"
          onChange={(event) => setUrl(event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Angezeigter Text</span>
        <input value={text} onChange={(event) => setText(event.target.value)} className={inputClass} />
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Abbrechen
        </Button>
        <Button variant="primary" type="submit" disabled={!url.trim()}>
          {draft.existing ? "Ändern" : "Einfügen"}
        </Button>
      </div>
    </form>
  );
};
