import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { messageOf } from "../api/client";
import { useFiles } from "../api/context";
import { formatSize } from "../lib/format";
import { freeText } from "../lib/storage";
import { m } from "../paraglide/messages";
import { DiskBar } from "../storage/disk-bar";

const Row = ({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border)] py-2 last:border-b-0">
    <dt className="flex flex-col gap-0.5">
      <span>{label}</span>
      {hint && <span className="text-xs text-[var(--muted-foreground)]">{hint}</span>}
    </dt>
    <dd className="m-0 shrink-0 tabular-nums">{value}</dd>
  </div>
);

/** What the user's files take, split by what can be freed, and the room left on the server. */
export const StorageSection = () => {
  const { queries } = useFiles();
  const storage = useQuery(queries.storage());
  const { usage, disk } = storage.data ?? { usage: null, disk: null };
  return (
    <section id="speicher" aria-label={m.storage_section_title()} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-base font-semibold">{m.storage_section_title()}</h2>
        <p className="m-0 text-sm text-[var(--muted-foreground)]">{m.storage_section_hint()}</p>
      </div>
      {storage.isError && (
        <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
          {messageOf(storage.error)}
        </p>
      )}
      {usage && (
        <dl className="m-0 flex flex-col text-sm">
          <Row label={m.storage_section_files()} value={formatSize(usage.files)} />
          <Row
            label={m.storage_section_versions()}
            value={formatSize(usage.versions)}
            hint={m.storage_section_versions_hint()}
          />
          <Row
            label={m.storage_section_trash()}
            value={formatSize(usage.trash)}
            hint={
              <Link to="/trash" className="text-inherit underline">
                {m.storage_section_open_trash()}
              </Link>
            }
          />
        </dl>
      )}
      {disk && (
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span>{m.storage_section_on_server()}</span>
            <span className="tabular-nums" data-testid="disk-free">
              {freeText(disk)}
            </span>
          </div>
          <DiskBar disk={disk} label={m.storage_section_used()} />
        </div>
      )}
    </section>
  );
};
