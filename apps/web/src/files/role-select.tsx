import type { ShareRole } from "@schreibzeug/files-api";
import { m } from "../paraglide/messages";

const ROLES: Record<ShareRole, () => string> = { edit: m.role_select_edit, view: m.role_select_view };

export const selectClass =
  "h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm outline-none focus:border-[var(--foreground)]";

/** "Darf bearbeiten" or "Darf ansehen", for people and for links. */
export const RoleSelect = ({
  value,
  label,
  onChange,
}: {
  value: ShareRole;
  label: string;
  onChange: (role: ShareRole) => void;
}) => (
  <select
    aria-label={label}
    value={value}
    onChange={(event) => onChange(event.target.value as ShareRole)}
    className={selectClass}
  >
    {(Object.keys(ROLES) as ShareRole[]).map((role) => (
      <option key={role} value={role}>
        {ROLES[role]()}
      </option>
    ))}
  </select>
);
