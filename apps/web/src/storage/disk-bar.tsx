import type { Storage } from "@schreibzeug/files-api";
import { diskLevel, type Tone } from "../lib/storage";

const FILL: Record<Tone, string> = {
  normal: "bg-[var(--primary)]",
  warn: "bg-amber-500",
  full: "bg-red-600 dark:bg-red-500",
};

/** How full the drive is, as a thin bar. */
export const DiskBar = ({ disk, label }: { disk: NonNullable<Storage["disk"]>; label: string }) => {
  const { percent, tone } = diskLevel(disk);
  return (
    <>
      {/* A native meter for screen readers; the bar is drawn by hand, as browsers style <meter> each their own way. */}
      <meter className="sr-only" aria-label={label} min={0} max={100} value={Math.round(percent)} />
      <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
        <div className={`h-full rounded-full ${FILL[tone]}`} style={{ width: `${percent}%` }} />
      </div>
    </>
  );
};
