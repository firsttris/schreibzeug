import { type FileNode, putShareSchema, type Share, type ShareRole } from "@stapel/files-api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { initialsOf } from "../account/initials";
import { messageOf } from "../api/client";
import { useFiles } from "../api/context";
import { fileKeys } from "../api/files";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { InviteLinks } from "./invite-links";
import { RoleSelect } from "./role-select";

export type ShareDialogProps = { node: FileNode; open: boolean; onClose: () => void };

/** Who else may open a node and how; the owner adds people by the e-mail of their account. */
export const ShareDialog = ({ node, open, onClose }: ShareDialogProps) => (
  <Dialog open={open} title={`${node.name} teilen`} onClose={onClose} wide>
    {open && <ShareForm node={node} onClose={onClose} />}
  </Dialog>
);

/** The writes answer with the new list, which replaces the cached one. */
const useShareMutation = <A extends unknown[]>(id: string, run: (...args: A) => Promise<Share[]>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: A) => run(...args),
    onSuccess: (list) => {
      queryClient.setQueryData(fileKeys.shares(id), list);
      void queryClient.invalidateQueries({ queryKey: fileKeys.all });
    },
  });
};

const ShareForm = ({ node, onClose }: { node: FileNode; onClose: () => void }) => {
  const { queries, commands } = useFiles();
  const shares = useQuery(queries.shares(node.id));
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("edit");
  const [error, setError] = useState<string | null>(null);
  const share = useShareMutation(node.id, (address: string, given: ShareRole) =>
    commands.share(node.id, address, given),
  );
  const unshare = useShareMutation(node.id, (userId: string) => commands.unshare(node.id, userId));

  const submit = async () => {
    const parsed = putShareSchema.safeParse({ email, role });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Ungültige Eingabe.");
    try {
      await share.mutateAsync([parsed.data.email, parsed.data.role]);
      setEmail("");
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">E-Mail des Kontos</span>
          <input
            type="email"
            // biome-ignore lint/a11y/noAutofocus: the dialog exists to type this address
            autoFocus
            value={email}
            placeholder="name@example.org"
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
            aria-invalid={error !== null}
            aria-describedby={error ? "share-error" : undefined}
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:border-[var(--foreground)] aria-invalid:border-red-500"
          />
        </label>
        <div className="flex gap-2">
          <RoleSelect value={role} label="Recht" onChange={setRole} />
          <Button variant="primary" type="submit" className="ml-auto" disabled={share.isPending}>
            Teilen
          </Button>
        </div>
        {error && (
          <p id="share-error" role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </form>

      {shares.isError && (
        <p role="alert" className="m-0 text-sm text-red-600">
          {messageOf(shares.error)}
        </p>
      )}
      {shares.data && shares.data.length === 0 && (
        <p className="m-0 text-sm text-[var(--muted-foreground)]">Noch mit niemandem geteilt.</p>
      )}
      {shares.data && shares.data.length > 0 && (
        <ul aria-label="Geteilt mit" className="m-0 flex list-none flex-col p-0">
          {shares.data.map((entry) => (
            <li
              key={entry.userId}
              data-share={entry.email}
              className="flex items-center gap-3 border-b border-[var(--border)] py-2 last:border-b-0"
            >
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-xs font-semibold"
              >
                {initialsOf(entry.name)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{entry.name}</span>
                <span className="truncate text-xs text-[var(--muted-foreground)]">{entry.email}</span>
              </span>
              <RoleSelect
                value={entry.role}
                label={`Recht von ${entry.name}`}
                onChange={(next) => share.mutate([entry.email, next])}
              />
              <Button
                variant="ghost"
                aria-label={`Freigabe für ${entry.name} entfernen`}
                disabled={unshare.isPending}
                onClick={() => unshare.mutate([entry.userId])}
              >
                <X size={15} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <InviteLinks node={node} />

      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Fertig
        </Button>
      </div>
    </div>
  );
};
