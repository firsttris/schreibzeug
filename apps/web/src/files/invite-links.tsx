import { type FileNode, INVITE_DAYS, type ShareRole } from "@schreibzeug/files-api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, X } from "lucide-react";
import { useState } from "react";
import { messageOf } from "../api/client";
import { useFiles } from "../api/context";
import { fileKeys } from "../api/files";
import { formatDay } from "../lib/format";
import { Button } from "../ui/button";
import { RoleSelect, selectClass } from "./role-select";

type Days = (typeof INVITE_DAYS)[number];

const DAYS_LABEL: Record<Days, string> = { 1: "1 Tag", 7: "7 Tage", 30: "30 Tage" };
const ROLE_TEXT: Record<ShareRole, string> = { edit: "Bearbeiten", view: "Ansehen" };

/** Where a link leads: the invitation page of this web app (router.tsx /invite/$token). */
export const inviteUrl = (token: string): string => `${window.location.origin}/invite/${token}`;

/** Copies the link, and says so for a moment. */
const CopyButton = ({ url }: { url: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      aria-label="Link kopieren"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </Button>
  );
};

/**
 * Links that share the node with whoever opens them: they sign in or create an account, even when
 * sign-up is closed, and get the link's role (apps/server src/files/invites.ts).
 */
export const InviteLinks = ({ node }: { node: FileNode }) => {
  const { queries, commands } = useFiles();
  const queryClient = useQueryClient();
  const links = useQuery(queries.invites(node.id));
  const [role, setRole] = useState<ShareRole>("view");
  const [days, setDays] = useState<Days>(7);
  const refresh = () => queryClient.invalidateQueries({ queryKey: fileKeys.invites(node.id) });
  const create = useMutation({
    mutationFn: () => commands.createInvite(node.id, { role, days }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (token: string) => commands.removeInvite(node.id, token),
    onSuccess: refresh,
  });
  const failure = create.error ?? remove.error ?? links.error;

  return (
    <section aria-label="Links" className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
      <span className="text-sm font-medium">Mit Link einladen</span>
      <div className="flex gap-2">
        <RoleSelect value={role} label="Recht des Links" onChange={setRole} />
        <select
          aria-label="Gültig"
          value={days}
          onChange={(event) => setDays(Number(event.target.value) as Days)}
          className={selectClass}
        >
          {INVITE_DAYS.map((value) => (
            <option key={value} value={value}>
              {DAYS_LABEL[value]}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          className="ml-auto"
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          <Link2 size={15} />
          Link erstellen
        </Button>
      </div>
      {failure && (
        <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
          {messageOf(failure)}
        </p>
      )}
      {links.data && links.data.length > 0 && (
        <ul aria-label="Aktive Links" className="m-0 flex list-none flex-col gap-1 p-0">
          {links.data.map((link) => (
            <li key={link.token} data-invite={link.token} className="flex items-center gap-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <input
                  readOnly
                  aria-label="Link"
                  value={inviteUrl(link.token)}
                  onFocus={(event) => event.currentTarget.select()}
                  className="h-8 min-w-0 rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 font-mono text-xs outline-none"
                />
                <span className="text-xs text-[var(--muted-foreground)]">
                  {ROLE_TEXT[link.role]} · gilt bis {formatDay(link.expiresAt)}
                </span>
              </span>
              <CopyButton url={inviteUrl(link.token)} />
              <Button
                variant="ghost"
                aria-label="Link löschen"
                disabled={remove.isPending}
                onClick={() => remove.mutate(link.token)}
              >
                <X size={15} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
