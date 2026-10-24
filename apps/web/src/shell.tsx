import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { Clock, FolderClosed, Layers, LogOut, Trash2, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useAccount, useUser } from "./account/context";
import { initialsOf } from "./account/initials";
import { rootLabel, useFiles } from "./api/context";
import { Button } from "./ui/button";

const NavLink = ({
  to,
  icon,
  children,
}: {
  to: "/" | "/recent" | "/shared" | "/trash";
  icon: ReactNode;
  children: ReactNode;
}) => (
  <Link
    to={to}
    activeOptions={{ exact: to === "/" }}
    className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-[var(--muted-foreground)] no-underline hover:bg-[var(--muted)] hover:text-[var(--foreground)] data-[status=active]:bg-[var(--muted)] data-[status=active]:font-medium data-[status=active]:text-[var(--foreground)]"
  >
    {icon}
    {children}
  </Link>
);

/** Who is signed in, and the way out; on this computer there is nobody to sign out. */
const AccountBox = () => {
  const user = useUser();
  const local = useFiles().info.mode === "local";
  const account = useAccount();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const signOut = async () => {
    await account.signOut();
    queryClient.clear();
    await navigate({ to: "/login" });
  };
  return (
    <div className="mt-auto hidden items-center gap-2 border-t border-[var(--border)] px-1.5 pt-3 md:flex">
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-xs font-semibold"
      >
        {initialsOf(user.name)}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium" data-testid="user-name">
          {user.name}
        </span>
        <span className="truncate text-xs text-[var(--muted-foreground)]">
          {local ? "Auf diesem Computer" : user.email}
        </span>
      </span>
      {!local && (
        <Button
          variant="ghost"
          className="ml-auto"
          aria-label="Abmelden"
          title="Abmelden"
          onClick={() => void signOut()}
        >
          <LogOut size={16} />
        </Button>
      )}
    </div>
  );
};

/**
 * The frame of the file pages: the navigation on the left, the page on the right. Files on this
 * computer are nobody else's, and deleting moves them into the system's trash.
 */
export const Shell = () => {
  const { info } = useFiles();
  const local = info.mode === "local";
  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b border-[var(--border)] p-3 md:w-60 md:border-r md:border-b-0">
        <Link to="/" className="flex items-center gap-2 px-1.5 text-[var(--foreground)] no-underline">
          <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)]">
            <Layers size={16} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Schreibzeug</span>
        </Link>
        <nav aria-label="Bereiche" className="flex gap-1 md:flex-col">
          <NavLink to="/" icon={<FolderClosed size={16} />}>
            {rootLabel(info)}
          </NavLink>
          <NavLink to="/recent" icon={<Clock size={16} />}>
            Zuletzt
          </NavLink>
          {!local && (
            <NavLink to="/shared" icon={<Users size={16} />}>
              Für mich freigegeben
            </NavLink>
          )}
          {!local && (
            <NavLink to="/trash" icon={<Trash2 size={16} />}>
              Papierkorb
            </NavLink>
          )}
        </nav>
        <AccountBox />
      </aside>
      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-4 p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
