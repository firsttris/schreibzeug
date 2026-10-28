import { type FileNode, putShareSchema, type Share, type ShareRole } from "@schreibzeug/files-api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { initialsOf } from "../account/initials";
import { messageOf } from "../api/client";
import { useFiles } from "../api/context";
import { fileKeys } from "../api/files";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { InviteLinks } from "./invite-links";
import { RoleSelect } from "./role-select";

export type ShareDialogProps = { node: FileNode; open: boolean; onClose: () => void };

/** Who else may open a node and how; the owner adds people by the e-mail of their account. */
export const ShareDialog = ({ node, open, onClose }: ShareDialogProps) => (
  <Dialog open={open} title={m.share_dialog_title({ name: node.name })} onClose={onClose} wide>
    {open && <ShareForm node={node} onClose={onClose} />}
  </Dialog>
);

/** The line under a name: the address, and what is not settled about it. */
export const detailOf = ({ email, pending, unverified }: Share): string => {
  if (pending) return m.share_dialog_pending();
  return unverified ? m.share_dialog_unverified({ email }) : email;
};

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
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? m.share_dialog_invalid());
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
          <span className="font-medium">{m.share_dialog_email()}</span>
          <input
            type="email"
            // biome-ignore lint/a11y/noAutofocus: the dialog exists to type this address
            autoFocus
            value={email}
            // i18n-ignore: an example address, the same in every language
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
          <RoleSelect value={role} label={m.share_dialog_role()} onChange={setRole} />
          <Button variant="primary" type="submit" className="ml-auto" disabled={share.isPending}>
            {m.share_dialog_share()}
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
        <p className="m-0 text-sm text-[var(--muted-foreground)]">{m.share_dialog_nobody()}</p>
      )}
      {shares.data && shares.data.length > 0 && (
        <ul aria-label={m.share_dialog_shared_with()} className="m-0 flex list-none flex-col p-0">
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
                <span
                  className="truncate text-xs text-[var(--muted-foreground)]"
                  title={entry.unverified ? m.share_dialog_unverified_hint() : undefined}
                >
                  {detailOf(entry)}
                </span>
              </span>
              <RoleSelect
                value={entry.role}
                label={m.share_dialog_role_of({ name: entry.name })}
                onChange={(next) => share.mutate([entry.email, next])}
              />
              <Button
                variant="ghost"
                aria-label={m.share_dialog_remove({ name: entry.name })}
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
          {m.common_done()}
        </Button>
      </div>
    </div>
  );
};
