import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, FilePlus2, FolderPlus, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { messageOf } from "../api/client";
import { rootLabel, useFiles } from "../api/context";
import { useFileMutation } from "../api/files";
import { Button } from "../ui/button";
import { MenuButton } from "../ui/menu";
import { FileBadge } from "./file-badge";
import { NameDialog } from "./name-dialog";
import { NodeActions } from "./node-actions";
import { NodeTable } from "./node-table";
import { PageHeader, PageMessage } from "./page";
import { useUpload } from "./use-upload";

type NewFile = "docx" | "xlsx" | "pptx";

/** What "Neu" offers, with the words the name dialog uses for each. */
const NEW_FILES: Record<NewFile, { item: string; title: string; label: string; name: string }> = {
  docx: {
    item: "Dokument",
    title: "Neues Dokument",
    label: "Name des Dokuments",
    name: "Unbenanntes Dokument",
  },
  xlsx: { item: "Tabelle", title: "Neue Tabelle", label: "Name der Tabelle", name: "Unbenannte Tabelle" },
  pptx: {
    item: "Präsentation",
    title: "Neue Präsentation",
    label: "Name der Präsentation",
    name: "Unbenannte Präsentation",
  },
};

type Creating = "folder" | NewFile | null;

/** The path from the top: the user's own files, or what was shared with them. */
const Breadcrumb = ({
  path,
  shared,
  root,
}: {
  path: { id: string; name: string }[];
  shared: boolean;
  root: string;
}) => (
  <nav aria-label="Pfad" className="flex min-w-0 items-center gap-1 text-sm text-[var(--muted-foreground)]">
    <Link
      to={shared ? "/shared" : "/"}
      className="shrink-0 text-inherit no-underline hover:text-[var(--foreground)]"
    >
      {shared ? "Für mich freigegeben" : root}
    </Link>
    {path.map((folder, index) => (
      <span key={folder.id} className="flex min-w-0 items-center gap-1">
        <ChevronRight size={14} className="shrink-0" aria-hidden />
        {index === path.length - 1 ? (
          <span aria-current="page" className="truncate font-medium text-[var(--foreground)]">
            {folder.name}
          </span>
        ) : (
          <Link
            to="/folders/$folderId"
            params={{ folderId: folder.id }}
            className="truncate text-inherit no-underline hover:text-[var(--foreground)]"
          >
            {folder.name}
          </Link>
        )}
      </span>
    ))}
  </nav>
);

/** One folder: what is in it, and the ways to add to it (new folder, new document, upload, drop). */
export const FolderPage = ({ folderId }: { folderId: string | null }) => {
  const { queries, commands, info } = useFiles();
  const navigate = useNavigate();
  const listing = useQuery(queries.folder(folderId));
  const [creating, setCreating] = useState<Creating>(null);
  const picker = useRef<HTMLInputElement>(null);
  const { upload, state, dragging, dropZone, dismiss } = useUpload(folderId);
  const createFolder = useFileMutation((name: string) => commands.createFolder(folderId, name));
  const createFile = useFileMutation((format: NewFile, name: string) =>
    commands.createBlank(folderId, name, format),
  );

  const title = listing.data?.folder?.name ?? rootLabel(info);
  const role = listing.data?.folder?.role ?? "owner";
  // Someone who may only look adds nothing; the buttons wait for the listing to know.
  const canAdd = listing.data !== undefined && role !== "view";

  return (
    <section
      {...(canAdd ? dropZone : {})}
      className="relative flex min-h-full flex-col gap-4"
      aria-label={title}
    >
      <PageHeader title={title}>
        {canAdd && (
          <>
            <Button variant="outline" onClick={() => setCreating("folder")}>
              <FolderPlus size={15} />
              Neuer Ordner
            </Button>
            <MenuButton
              label="Neu"
              variant="outline"
              align="right"
              groups={[
                (Object.keys(NEW_FILES) as NewFile[]).map((format) => ({
                  label: NEW_FILES[format].item,
                  icon: <FileBadge kind={format} size={22} />,
                  onSelect: () => setCreating(format),
                })),
              ]}
            >
              <FilePlus2 size={15} />
              Neu
            </MenuButton>
            <Button variant="primary" onClick={() => picker.current?.click()}>
              <Upload size={15} />
              Hochladen
            </Button>
            <input
              ref={picker}
              type="file"
              multiple
              data-testid="upload-input"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                void upload([...(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
          </>
        )}
      </PageHeader>

      {folderId && listing.data && (
        <Breadcrumb path={listing.data.path} shared={role !== "owner"} root={rootLabel(info)} />
      )}

      {state.running > 0 && (
        <p role="status" className="m-0 text-sm text-[var(--muted-foreground)]">
          {state.running === 1
            ? "Eine Datei wird hochgeladen …"
            : `${state.running} Dateien werden hochgeladen …`}
        </p>
      )}
      {state.failures.length > 0 && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-300"
        >
          <ul className="m-0 list-none p-0">
            {state.failures.map((failure) => (
              <li key={failure}>{failure}</li>
            ))}
          </ul>
          <Button variant="ghost" onClick={dismiss}>
            Schließen
          </Button>
        </div>
      )}

      {listing.isPending && <PageMessage>Lädt …</PageMessage>}
      {listing.isError && <PageMessage tone="error">{messageOf(listing.error)}</PageMessage>}
      {listing.data && (
        <NodeTable
          nodes={listing.data.children}
          actions={(node) => <NodeActions node={node} />}
          empty="Dieser Ordner ist leer. Ziehe Dateien hierher oder lege ein Dokument an."
        />
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl border-2 border-dashed border-[var(--docx)] bg-[var(--docx-muted)]/80 text-sm font-medium text-[var(--docx)]">
          Zum Hochladen loslassen
        </div>
      )}

      <NameDialog
        open={creating === "folder"}
        title="Neuer Ordner"
        label="Name des Ordners"
        initialName="Neuer Ordner"
        confirm="Anlegen"
        onSubmit={(name) => createFolder.mutateAsync([name])}
        onClose={() => setCreating(null)}
      />
      {(Object.keys(NEW_FILES) as NewFile[]).map((format) => (
        <NameDialog
          key={format}
          open={creating === format}
          title={NEW_FILES[format].title}
          label={NEW_FILES[format].label}
          initialName={NEW_FILES[format].name}
          confirm="Anlegen und öffnen"
          onSubmit={async (name) => {
            const created = await createFile.mutateAsync([format, name]);
            await navigate({ to: "/edit/$fileId", params: { fileId: created.id } });
          }}
          onClose={() => setCreating(null)}
        />
      ))}
    </section>
  );
};
