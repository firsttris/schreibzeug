import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import {
  Clock,
  EllipsisVertical,
  FolderClosed,
  LogOut,
  PenLine,
  Settings,
  Trash2,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAccount, useUser } from "./account/context";
import { initialsOf } from "./account/initials";
import { rootLabel, useFiles } from "./api/context";
import { inDesktopApp, runDesktopCommand } from "./desktop";
import { useEmbed } from "./embed/bridge";
import { Button } from "./ui/button";
import { MenuButton } from "./ui/menu";

/** What the desktop app's menu bar held: where the window works. */
const DesktopMenu = ({ local }: { local: boolean }) => (
  <div className="ml-auto">
    <MenuButton
      label="Arbeitsort"
      variant="ghost"
      up
      align="right"
      groups={[
        [
          ...(local
            ? []
            : [{ label: "Auf diesem Computer", onSelect: () => runDesktopCommand("work-locally") }]),
          { label: "Ordner wählen …", onSelect: () => runDesktopCommand("choose-folder") },
          { label: "Mit Server verbinden …", onSelect: () => runDesktopCommand("choose-server") },
        ],
      ]}
    >
      <EllipsisVertical size={16} />
    </MenuButton>
  </div>
);

const NavLink = ({
  to,
  icon,
  children,
}: {
  to: "/" | "/recent" | "/shared" | "/trash" | "/settings";
  icon: ReactNode;
  children: ReactNode;
}) => (
  <Link
    to={to}
    activeOptions={{ exact: to === "/" }}
    className="flex h-9 shrink-0 items-center gap-2.5 rounded-md px-2.5 whitespace-nowrap text-sm text-[var(--muted-foreground)] no-underline hover:bg-[var(--muted)] hover:text-[var(--foreground)] data-[status=active]:bg-[var(--muted)] data-[status=active]:font-medium data-[status=active]:text-[var(--foreground)]"
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
      {inDesktopApp() && <DesktopMenu local={local} />}
      {!local && (
        <Button
          variant="ghost"
          className={inDesktopApp() ? "" : "ml-auto"}
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
  // In Kontext's frame Kontext shows the name, the account and the way out.
  const { embedded } = useEmbed();
  return (
    <div className="flex h-full min-w-0 flex-col md:flex-row">
      <aside className="flex min-w-0 shrink-0 flex-col gap-4 border-b border-[var(--border)] p-3 md:w-60 md:border-r md:border-b-0">
        {!embedded && (
          <Link to="/" className="flex items-center gap-2 px-1.5 text-[var(--foreground)] no-underline">
            <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)]">
              <PenLine size={16} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Schreibzeug</span>
          </Link>
        )}
        {/* On a phone the areas are one row that scrolls sideways, not a page wider than the screen. */}
        <nav aria-label="Bereiche" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
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
          {!local && (
            <NavLink to="/settings" icon={<Settings size={16} />}>
              Einstellungen
            </NavLink>
          )}
        </nav>
        {!embedded && <AccountBox />}
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-auto">
        <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-4 p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
