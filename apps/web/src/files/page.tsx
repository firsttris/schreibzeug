import type { ReactNode } from "react";

/** The title row of a file page, with its actions on the right. */
export const PageHeader = ({ title, children }: { title: string; children?: ReactNode }) => (
  <header className="flex flex-wrap items-center justify-between gap-3">
    <h1 className="m-0 truncate text-xl font-semibold tracking-tight">{title}</h1>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </header>
);

export const PageMessage = ({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "error";
}) => (
  <p
    role={tone === "error" ? "alert" : "status"}
    className={`m-0 py-16 text-center text-sm ${tone === "error" ? "text-red-600 dark:text-red-400" : "text-[var(--muted-foreground)]"}`}
  >
    {children}
  </p>
);
