import { PenLine } from "lucide-react";

/** The name and mark above the pages outside the shell: sign-in and invitations. */
export const Brand = () => (
  <div className="flex items-center gap-2">
    <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)]">
      <PenLine size={18} />
    </span>
    <span className="text-lg font-semibold tracking-tight">Schreibzeug</span>
  </div>
);
