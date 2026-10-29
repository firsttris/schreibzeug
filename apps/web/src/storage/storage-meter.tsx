import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useFiles } from "../api/context";
import { formatSize } from "../lib/format";
import { m } from "../paraglide/messages";
import { DiskBar } from "./disk-bar";

/**
 * The room on the server at the foot of the navigation: how full its drive is and what the user's
 * files take; the details are in the settings. Every account sees the drive, which they share.
 */
export const StorageMeter = () => {
  const { queries } = useFiles();
  const { data } = useQuery(queries.storage());
  if (!data?.disk) return null;
  const used = data.usage ? data.usage.files + data.usage.versions + data.usage.trash : null;
  return (
    <Link
      to="/settings"
      hash="speicher"
      data-testid="storage-meter"
      className="hidden flex-col gap-1.5 rounded-md px-2.5 py-2 text-xs text-[var(--muted-foreground)] no-underline hover:bg-[var(--muted)] md:flex"
    >
      <span className="font-medium text-[var(--foreground)]">{m.storage_meter_title()}</span>
      <DiskBar disk={data.disk} label={m.storage_meter_used()} />
      <span>
        {used === null
          ? m.storage_meter_free({ free: formatSize(data.disk.free) })
          : m.storage_meter_used_free({ used: formatSize(used), free: formatSize(data.disk.free) })}
      </span>
    </Link>
  );
};
