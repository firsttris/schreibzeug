import type { FileNode } from "@schreibzeug/files-api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Pin, PinOff, RotateCcw } from "lucide-react";
import { messageOf } from "../api/client";
import { useFiles } from "../api/context";
import { useFileMutation } from "../api/files";
import { formatChanged, formatSize } from "../lib/format";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

export type VersionsDialogProps = {
  file: FileNode;
  open: boolean;
  onClose: () => void;
  /** After a restore, e.g. to open the restored content in the editor. */
  onRestored?: (file: FileNode) => void;
};

/**
 * The saved states of a file, newest first: download any, make an older one the newest again, keep
 * one so that thinning out the older versions never drops it.
 */
export const VersionsDialog = ({ file, open, onClose, onRestored }: VersionsDialogProps) => (
  <Dialog open={open} title={`Versionen von ${file.name}`} onClose={onClose}>
    {open && <VersionList file={file} onClose={onClose} {...(onRestored ? { onRestored } : {})} />}
  </Dialog>
);

const VersionList = ({ file, onClose, onRestored }: Omit<VersionsDialogProps, "open">) => {
  const { queries, commands } = useFiles();
  const versions = useQuery(queries.versions(file.id));
  const restore = useFileMutation((number: number) => commands.restoreVersion(file.id, number));
  const client = useQueryClient();
  const keep = useMutation({
    mutationFn: ([number, kept]: [number, boolean]) => commands.keepVersion(file.id, number, kept),
    onSettled: () => client.invalidateQueries({ queryKey: queries.versions(file.id).queryKey }),
  });

  if (versions.isPending) return <p className="m-0 text-sm text-[var(--muted-foreground)]">Lädt …</p>;
  if (versions.isError)
    return (
      <p role="alert" className="m-0 text-sm text-red-600">
        {messageOf(versions.error)}
      </p>
    );

  return (
    <div className="flex flex-col gap-3">
      <ol className="m-0 flex max-h-80 list-none flex-col overflow-y-auto p-0" aria-label="Versionen">
        {versions.data.map((version) => {
          const current = version.number === file.version;
          return (
            <li
              key={version.id}
              data-version={version.number}
              className="flex items-center gap-3 border-b border-[var(--border)] py-2 last:border-b-0"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">
                  Version {version.number}
                  {current && (
                    <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">aktuell</span>
                  )}
                  {version.kept && (
                    <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">behalten</span>
                  )}
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {formatChanged(version.createdAt)} · {formatSize(version.size)}
                </span>
              </span>
              <a
                href={commands.contentUrl(file.id, version.number)}
                download={file.name}
                aria-label={`Version ${version.number} herunterladen`}
                className="inline-flex h-8 min-w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <Download size={15} />
              </a>
              {file.role !== "view" && (
                <Button
                  variant="ghost"
                  aria-label={
                    version.kept
                      ? `Version ${version.number} nicht mehr behalten`
                      : `Version ${version.number} behalten`
                  }
                  aria-pressed={version.kept}
                  disabled={keep.isPending}
                  onClick={() => keep.mutate([version.number, !version.kept])}
                >
                  {version.kept ? <PinOff size={15} /> : <Pin size={15} />}
                </Button>
              )}
              {!current && file.role !== "view" && (
                <Button
                  variant="ghost"
                  aria-label={`Version ${version.number} wiederherstellen`}
                  disabled={restore.isPending}
                  onClick={async () => {
                    const restored = await restore.mutateAsync([version.number]);
                    onRestored?.(restored);
                    onClose();
                  }}
                >
                  <RotateCcw size={15} />
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      {(restore.isError || keep.isError) && (
        <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
          {messageOf(restore.error ?? keep.error)}
        </p>
      )}
      {file.role !== "view" && (
        <p className="m-0 text-xs text-[var(--muted-foreground)]">
          Wiederherstellen legt eine neue Version mit dem alten Inhalt an. Ältere Versionen werden ausgedünnt
          (ab einem Tag eine pro Stunde, ab einem Monat eine pro Tag, ab einem Jahr eine pro Woche); behaltene
          Versionen bleiben immer.
        </p>
      )}
    </div>
  );
};
