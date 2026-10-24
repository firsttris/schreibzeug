import { nodeNameSchema } from "@schreibzeug/files-api";
import { useState } from "react";
import { messageOf } from "../api/client";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

export type NameDialogProps = {
  open: boolean;
  title: string;
  label: string;
  initialName: string;
  confirm: string;
  onSubmit: (name: string) => Promise<unknown>;
  onClose: () => void;
};

/** Asks for a name, checks it like the server does, and shows the server's answer when it refuses. */
export const NameDialog = (props: NameDialogProps) => (
  <Dialog open={props.open} title={props.title} onClose={props.onClose}>
    <NameForm key={props.initialName} {...props} />
  </Dialog>
);

/**
 * Selects the name without its extension, so typing replaces only the part people rename. On focus,
 * after it: the dialog focuses the field when it opens, and WebKit (Safari, the desktop app on
 * macOS and Linux) places the caret after the focus event, over a selection made before.
 */
const selectBaseName = (input: HTMLInputElement) => {
  const dot = input.value.lastIndexOf(".");
  input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
};

const NameForm = ({ label, initialName, confirm, onSubmit, onClose }: NameDialogProps) => {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = nodeNameSchema.safeParse(name);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Ungültiger Name.");
    setBusy(true);
    try {
      await onSubmit(parsed.data);
      onClose();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{label}</span>
        <input
          onFocus={(event) => {
            const input = event.currentTarget;
            requestAnimationFrame(() => selectBaseName(input));
          }}
          // biome-ignore lint/a11y/noAutofocus: the dialog exists to type this name
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          aria-invalid={error !== null}
          aria-describedby={error ? "name-error" : undefined}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--foreground)] aria-invalid:border-red-500"
        />
      </label>
      {error && (
        <p id="name-error" role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Abbrechen
        </Button>
        <Button variant="primary" type="submit" disabled={busy}>
          {confirm}
        </Button>
      </div>
    </form>
  );
};
