import { Link, Outlet } from "@tanstack/react-router";
import { Clock, FolderClosed, Layers, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

const NavLink = ({
  to,
  icon,
  children,
}: {
  to: "/" | "/recent" | "/trash";
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

/** The frame of the file pages: the navigation on the left, the page on the right. */
export const Shell = () => (
  <div className="flex h-full flex-col md:flex-row">
    <aside className="flex shrink-0 flex-col gap-4 border-b border-[var(--border)] p-3 md:w-60 md:border-r md:border-b-0">
      <Link to="/" className="flex items-center gap-2 px-1.5 text-[var(--foreground)] no-underline">
        <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)]">
          <Layers size={16} />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Stapel</span>
      </Link>
      <nav aria-label="Bereiche" className="flex gap-1 md:flex-col">
        <NavLink to="/" icon={<FolderClosed size={16} />}>
          Meine Dateien
        </NavLink>
        <NavLink to="/recent" icon={<Clock size={16} />}>
          Zuletzt
        </NavLink>
        <NavLink to="/trash" icon={<Trash2 size={16} />}>
          Papierkorb
        </NavLink>
      </nav>
    </aside>
    <main className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-4 p-4 md:p-8">
        <Outlet />
      </div>
    </main>
  </div>
);
