import type { FileNode, Invitation } from "@schreibzeug/files-api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { messageOf } from "../api/client";
import { useFiles } from "../api/context";
import { refreshFiles } from "../api/files";
import { formatDay, isEditable } from "../lib/format";
import { m } from "../paraglide/messages";
import { Button } from "../ui/button";
import { Brand } from "./brand";
import { useAccount } from "./context";

const linkClass =
  "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium no-underline";

const describe = ({ ownerName, nodeName, kind, role }: Invitation): string => {
  const values = { owner: ownerName, name: nodeName };
  if (kind === "folder")
    return role === "edit" ? m.invite_page_shares_folder(values) : m.invite_page_shares_folder_view(values);
  return role === "edit" ? m.invite_page_shares_file(values) : m.invite_page_shares_file_view(values);
};

/** Where an accepted link leads: into the folder, into the editor, or to what was shared. */
const useOpenNode = () => {
  const navigate = useNavigate();
  return (node: FileNode) => {
    if (node.kind === "folder") return navigate({ to: "/folders/$folderId", params: { folderId: node.id } });
    if (isEditable(node)) return navigate({ to: "/edit/$fileId", params: { fileId: node.id } });
    return navigate({ to: "/shared" });
  };
};

/**
 * The page a shared link opens. It says what is shared and by whom, readable without signing in;
 * someone without a session signs in or creates an account first (the link opens a closed sign-up)
 * and comes back here to accept.
 */
export const InvitePage = ({ token }: { token: string }) => {
  const account = useAccount();
  const { queries, commands } = useFiles();
  const session = useQuery(account.session);
  const invitation = useQuery(queries.invitation(token));
  const open = useOpenNode();
  const accept = useMutation({
    mutationFn: () => commands.acceptInvite(token),
    onSuccess: async (node, _vars, _result, { client }) => {
      await refreshFiles(client);
      await open(node);
    },
  });
  const back = `/invite/${token}`;

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Brand />
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-xl font-semibold">{m.invite_page_title()}</h1>
          {invitation.isPending && (
            <p className="m-0 text-sm text-[var(--muted-foreground)]">{m.invite_page_loading()}</p>
          )}
          {invitation.isError && (
            <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
              {messageOf(invitation.error)}
            </p>
          )}
          {invitation.data && (
            <>
              <p className="m-0 text-sm" data-testid="invitation">
                {describe(invitation.data)}
              </p>
              <p className="m-0 text-xs text-[var(--muted-foreground)]">
                {m.invite_page_valid_until({ date: formatDay(invitation.data.expiresAt) })}
              </p>
            </>
          )}
        </div>

        {invitation.data && session.data && (
          <div className="flex flex-col gap-2">
            <Button variant="primary" disabled={accept.isPending} onClick={() => accept.mutate()}>
              {m.invite_page_accept()}
            </Button>
            <p className="m-0 text-xs text-[var(--muted-foreground)]">
              {m.invite_page_signed_in_as({ email: session.data.email })}
            </p>
            {accept.isError && (
              <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
                {messageOf(accept.error)}
              </p>
            )}
          </div>
        )}
        {invitation.data && session.data === null && (
          <div className="flex flex-col gap-2">
            <Link
              to="/login"
              search={{ redirect: back, invite: token, mode: "signUp" }}
              className={`${linkClass} bg-[var(--primary)] text-[var(--primary-foreground)]`}
            >
              {m.invite_page_sign_up()}
            </Link>
            <Link
              to="/login"
              search={{ redirect: back }}
              className={`${linkClass} border border-[var(--border)] text-[var(--foreground)]`}
            >
              {m.invite_page_have_account()}
            </Link>
          </div>
        )}
        {invitation.isError && <Link to="/">{m.invite_page_to_app()}</Link>}
      </div>
    </main>
  );
};
