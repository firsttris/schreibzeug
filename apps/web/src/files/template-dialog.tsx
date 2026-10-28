import { nodeNameSchema } from "@schreibzeug/files-api";
import { TEMPLATES } from "@schreibzeug/ooxml";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { messageOf } from "../api/client";
import { useFiles } from "../api/context";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { FileBadge } from "./file-badge";
import {
  choiceKey,
  choiceName,
  fileNameFor,
  formatOf,
  ownTemplates,
  TEMPLATE_FOLDER,
  type TemplateChoice,
  templateFolderOf,
} from "./templates";

const BUILT_IN: TemplateChoice[] = TEMPLATES.map((template) => ({ kind: "builtin", template }));

/** The user's own templates: the files in "Vorlagen" at the top of their files. */
const useOwnTemplates = (open: boolean): TemplateChoice[] => {
  const { queries } = useFiles();
  const top = useQuery({ ...queries.folder(null), enabled: open });
  const folder = templateFolderOf(top.data?.children ?? []);
  const inFolder = useQuery({ ...queries.folder(folder?.id ?? null), enabled: open && folder !== null });
  return folder && inFolder.data ? ownTemplates(inFolder.data.children) : [];
};

/** One template as a radio button with its kind, name and what it holds. */
const ChoiceOption = ({
  choice,
  selected,
  onSelect,
}: {
  choice: TemplateChoice;
  selected: boolean;
  onSelect: () => void;
}) => (
  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] p-2.5 hover:bg-[var(--muted)] has-[:checked]:border-[var(--foreground)] has-[:checked]:bg-[var(--muted)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--foreground)]">
    <input type="radio" name="template" className="sr-only" checked={selected} onChange={onSelect} />
    <FileBadge kind={formatOf(choice)} size={28} />
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-sm font-medium">{choiceName(choice)}</span>
      <span className="truncate text-xs text-[var(--muted-foreground)]">
        {choice.kind === "builtin" ? choice.template.description : choice.node.name}
      </span>
    </span>
  </label>
);

export type TemplateDialogProps = {
  open: boolean;
  /** Where the new file goes. */
  folderId: string | null;
  onCreated: (fileId: string) => Promise<unknown>;
  onClose: () => void;
};

/**
 * "Neu aus Vorlage": a built-in template or one of the user's own, and the new file's name. The file
 * is the template's bytes uploaded under that name, so it works the same on a server and on the
 * computer, and an own template stays as it is.
 */
export const TemplateDialog = ({ open, folderId, onCreated, onClose }: TemplateDialogProps) => {
  const { commands } = useFiles();
  const own = useOwnTemplates(open);
  const [choice, setChoice] = useState<TemplateChoice | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (next: TemplateChoice) => {
    setChoice(next);
    setName(choiceName(next));
    setError(null);
  };

  const close = () => {
    setChoice(null);
    setError(null);
    onClose();
  };

  const create = async () => {
    if (!choice) return;
    const parsed = nodeNameSchema.safeParse(fileNameFor(name, formatOf(choice)));
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? m.template_dialog_invalid());
    setBusy(true);
    try {
      const bytes =
        choice.kind === "builtin" ? choice.template.bytes() : await commands.content(choice.node.id);
      const created = await commands.upload(folderId, new File([bytes as BlobPart], parsed.data));
      close();
      await onCreated(created.id);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  };

  const list = (label: string, choices: TemplateChoice[]) => (
    <fieldset aria-label={label} className="m-0 grid grid-cols-1 gap-2 border-0 p-0 sm:grid-cols-2">
      {choices.map((each) => (
        <ChoiceOption
          key={choiceKey(each)}
          choice={each}
          selected={choice !== null && choiceKey(choice) === choiceKey(each)}
          onSelect={() => pick(each)}
        />
      ))}
    </fieldset>
  );

  return (
    <Dialog open={open} title={m.template_dialog_title()} wide onClose={close}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        {list(m.template_dialog_templates(), BUILT_IN)}
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-medium">{m.template_dialog_own()}</h3>
          {own.length > 0 ? (
            list(m.template_dialog_own(), own)
          ) : (
            <p className="m-0 text-sm text-[var(--muted-foreground)]">
              {m.template_dialog_own_hint({ folder: TEMPLATE_FOLDER })}
            </p>
          )}
        </section>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">{m.template_dialog_name()}</span>
          <input
            value={name}
            disabled={!choice}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            aria-invalid={error !== null}
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--foreground)] disabled:opacity-50 aria-invalid:border-red-500"
          />
        </label>
        {error && (
          <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={close}>{m.common_cancel()}</Button>
          <Button type="submit" variant="primary" disabled={!choice || busy}>
            {m.template_dialog_create_open()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
