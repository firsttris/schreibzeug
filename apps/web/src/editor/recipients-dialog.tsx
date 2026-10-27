import type { FileNode } from "@schreibzeug/files-api";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Folder, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { rootLabel, useFiles } from "../api/context";
import { FileBadge } from "../files/file-badge";
import { kindOf } from "../lib/format";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { newConverter } from "./engine";
import { isRecipientTable, type Recipients, recipientsOf, tableOf } from "./mail-merge";

type RecipientsDialogProps = {
  open: boolean;
  /** Where the browsing starts: the folder of the open document. */
  folderId: string | null;
  onClose: () => void;
  onChoose: (recipients: Recipients) => void;
};

/**
 * "Empfänger wählen": a table from the user's files (walking the folders as the move dialog does)
 * or from the computer, read and shown before it is taken.
 */
export const RecipientsDialog = ({ open, folderId, onClose, onChoose }: RecipientsDialogProps) => (
  <Dialog open={open} title="Empfänger wählen" wide onClose={onClose}>
    {open && <Chooser folderId={folderId} onClose={onClose} onChoose={onChoose} />}
  </Dialog>
);

const readTable = async (name: string, bytes: Uint8Array) => {
  const converter = newConverter();
  try {
    return recipientsOf(name, await tableOf(name, bytes, converter.convert));
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  } finally {
    converter.terminate();
  }
};

const Chooser = ({ folderId: start, onClose, onChoose }: Omit<RecipientsDialogProps, "open">) => {
  const { queries, commands, info } = useFiles();
  const [folderId, setFolderId] = useState(start);
  const [chosen, setChosen] = useState<Recipients | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listing = useQuery(queries.folder(folderId));
  const entries = (listing.data?.children ?? []).filter(
    (child) => child.kind === "folder" || isRecipientTable(child.name),
  );

  const take = async (name: string, load: () => Promise<Uint8Array>) => {
    setBusy(true);
    setFailure(null);
    setChosen(null);
    const result = await load().then((bytes) => readTable(name, bytes));
    setBusy(false);
    if (result.ok) setChosen(result.recipients);
    else setFailure(`„${name}“: ${result.error}`);
  };
  const fromFiles = (node: FileNode) =>
    void take(node.name, async () => new Uint8Array(await commands.content(node.id)));

  const [header = [], ...recipients] = chosen?.rows ?? [];
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-[var(--muted-foreground)]">
        Eine Tabelle mit einem Empfänger je Zeile; die erste Zeile nennt die Felder, z. B. „Anrede“, „Name“,
        „Straße“.
      </p>
      <div className="flex items-center gap-1 text-sm">
        {folderId !== null && (
          <Button
            variant="ghost"
            aria-label="Eine Ebene höher"
            onClick={() => setFolderId(listing.data?.folder?.parentId ?? null)}
          >
            <ChevronLeft size={16} />
          </Button>
        )}
        <span className="truncate font-medium">{listing.data?.folder?.name ?? rootLabel(info)}</span>
      </div>
      <ul className="m-0 flex max-h-56 min-h-24 list-none flex-col overflow-y-auto rounded-md border border-[var(--border)] p-1">
        {listing.isPending && <li className="p-2 text-sm text-[var(--muted-foreground)]">Lädt …</li>}
        {listing.data && entries.length === 0 && (
          <li className="p-2 text-sm text-[var(--muted-foreground)]">Keine Tabellen in diesem Ordner</li>
        )}
        {entries.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              aria-label={node.kind === "folder" ? `Ordner ${node.name} öffnen` : `${node.name} wählen`}
              disabled={busy}
              onClick={() => (node.kind === "folder" ? setFolderId(node.id) : fromFiles(node))}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-[var(--muted)]"
            >
              {node.kind === "folder" ? (
                <Folder size={16} className="shrink-0 text-[var(--muted-foreground)]" aria-hidden />
              ) : (
                <FileBadge kind={kindOf(node)} size={20} />
              )}
              <span className="flex-1 truncate">{node.name}</span>
              {node.kind === "folder" && (
                <ChevronRight size={14} className="text-[var(--muted-foreground)]" aria-hidden />
              )}
            </button>
          </li>
        ))}
      </ul>
      <div>
        <Button variant="ghost" disabled={busy} onClick={() => input.current?.click()}>
          <Upload size={14} />
          Vom Computer …
        </Button>
        <input
          ref={input}
          type="file"
          className="hidden"
          data-testid="recipients-input"
          accept=".xlsx,.ods,.xls,.csv"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = "";
            if (picked) void take(picked.name, async () => new Uint8Array(await picked.arrayBuffer()));
          }}
        />
      </div>
      {busy && (
        <p role="status" className="m-0 text-sm">
          Wird gelesen …
        </p>
      )}
      {failure && (
        <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
          {failure}
        </p>
      )}
      {chosen && (
        <div className="flex flex-col gap-1 text-sm" data-testid="recipients-preview">
          <p className="m-0">
            „{chosen.source}“: {recipients.length} Empfänger, Felder {header.join(", ")}
          </p>
          <div className="overflow-x-auto rounded-md border border-[var(--border)]">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  {header.map((name) => (
                    <th
                      key={name}
                      className="border-b border-[var(--border)] px-2 py-1 text-left font-medium"
                    >
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recipients.slice(0, 3).map((row, index) => (
                  // Rows have no key of their own; the first three are shown in order.
                  // biome-ignore lint/suspicious/noArrayIndexKey: see above
                  <tr key={index}>
                    {row.map((value, column) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: columns by position
                      <td key={column} className="px-2 py-1">
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
        <Button
          variant="primary"
          disabled={!chosen}
          onClick={() => {
            if (chosen) onChoose(chosen);
            onClose();
          }}
        >
          Übernehmen
        </Button>
      </div>
    </div>
  );
};
