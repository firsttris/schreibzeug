import { FlaskConical } from "lucide-react";
import { m } from "../paraglide/messages";

/** The installation guide, for whoever wants Schreibzeug with its server after trying the demo. */
const INSTALLATION_URL = "https://firsttris.github.io/schreibzeug/installation.html";

/** Says what the demo is: the files live in this tab only, and what needs a server is missing. */
export const DemoNotice = () => (
  <aside
    aria-label={m.demo_notice_title()}
    className="flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-xs text-[var(--muted-foreground)]"
    data-testid="demo-notice"
  >
    <span className="flex items-center gap-1.5 font-semibold text-[var(--foreground)]">
      <FlaskConical size={14} />
      {m.demo_notice_title()}
    </span>
    <span>{m.demo_notice_text()}</span>
    <a
      href={INSTALLATION_URL}
      target="_blank"
      rel="noreferrer"
      className="text-[var(--foreground)] underline"
    >
      {m.demo_notice_install()}
    </a>
  </aside>
);
