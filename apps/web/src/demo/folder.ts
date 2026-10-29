import { CHANGED_SINCE, copyName, type FileNode, type FolderListing } from "@schreibzeug/files-api";
import type { LocalDeps } from "@schreibzeug/local";
import { mimeOf } from "@schreibzeug/server/files/mime";
import { fail, ok, type Result } from "@schreibzeug/server/result";

/**
 * The files API's operations (apps/local folder.ts) on files held in the page: the demo's
 * "Meine Dateien". Same shapes and the same rules as a folder on the computer (names unique per
 * folder ignoring case, a save overwrites the file and counts its version up), gone on reload.
 */
export type Folder = LocalDeps["folder"];

type Entry = {
  id: string;
  parentId: string | null;
  kind: FileNode["kind"];
  name: string;
  bytes: Uint8Array | null;
  version: number | null;
  createdAt: string;
  updatedAt: string;
};

// i18n-ignore: what the API answers, in the server's words (docs/architecture.md#interface-texts)
const NOT_FOUND = "Diese Datei oder diesen Ordner gibt es nicht.";
// i18n-ignore: what the API answers, in the server's words
const NAME_TAKEN = "Hier gibt es schon etwas mit diesem Namen.";
// i18n-ignore: what the API answers, in the server's words
const NOT_A_FOLDER = "Das ist kein Ordner.";
// i18n-ignore: what the API answers, in the server's words
const INTO_ITSELF = "Ein Ordner kann nicht in sich selbst verschoben werden.";

const MAX_COPY_ATTEMPTS = 50;

const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** The SHA-256 of bytes, as files-api `ifMatchOf` names a version. */
export const sha256Of = async (bytes: Uint8Array): Promise<string> =>
  hex(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));

const sameName = (a: string, b: string) => a.toLocaleLowerCase("de") === b.toLocaleLowerCase("de");

/** Folders first, then by name, as on the computer (apps/local folder.ts `list`). */
const byKindAndName = (a: Entry, b: Entry) =>
  Number(b.kind === "folder") - Number(a.kind === "folder") ||
  a.name.localeCompare(b.name, "de", { sensitivity: "base" }) ||
  a.name.localeCompare(b.name);

export type MemoryFolderDeps = { now?: () => Date; newId?: () => string };

export const createMemoryFolder = ({
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
}: MemoryFolderDeps = {}): Folder => {
  const entries = new Map<string, Entry>();

  const toNode = (entry: Entry): FileNode => ({
    id: entry.id,
    parentId: entry.parentId,
    kind: entry.kind,
    name: entry.name,
    mime: entry.kind === "file" ? mimeOf(entry.name) : null,
    size: entry.bytes?.length ?? null,
    version: entry.version,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    trashedAt: null,
    role: "owner",
  });

  const childrenOf = (parentId: string | null) =>
    [...entries.values()].filter((entry) => entry.parentId === parentId).sort(byKindAndName);

  const isFree = (parentId: string | null, name: string, self?: string) =>
    !childrenOf(parentId).some((entry) => entry.id !== self && sameName(entry.name, name));

  /** The entry and the folders above it, from below the root down. */
  const lineOf = (entry: Entry): Entry[] => {
    const parent = entry.parentId === null ? undefined : entries.get(entry.parentId);
    return parent ? [...lineOf(parent), entry] : [entry];
  };

  const pathOf = (entry: Entry) =>
    lineOf(entry)
      .map((each) => each.name)
      .join("/");

  const findEntry = (id: string, kind?: FileNode["kind"]): Result<Entry> => {
    const entry = entries.get(id);
    if (!entry) return fail("not_found", NOT_FOUND);
    if (kind === undefined || entry.kind === kind) return ok(entry);
    return kind === "folder" ? fail("not_a_folder", NOT_A_FOLDER) : fail("not_found", NOT_FOUND);
  };

  const withPath = (entry: Entry) => ({ ...toNode(entry), path: pathOf(entry) });

  /** The folder something goes into: the root for null. */
  const targetFolder = (parentId: string | null): Result<string | null> => {
    if (parentId === null) return ok(null);
    const folder = findEntry(parentId, "folder");
    return folder.ok ? ok(folder.value.id) : folder;
  };

  const add = (parentId: string | null, name: string, bytes: Uint8Array | null): Result<FileNode> => {
    const folder = targetFolder(parentId);
    if (!folder.ok) return folder;
    if (!isFree(folder.value, name)) return fail("name_taken", NAME_TAKEN);
    const time = now().toISOString();
    const entry: Entry = {
      id: newId(),
      parentId: folder.value,
      kind: bytes ? "file" : "folder",
      name,
      bytes,
      version: bytes ? 1 : null,
      createdAt: time,
      updatedAt: time,
    };
    entries.set(entry.id, entry);
    return ok(toNode(entry));
  };

  const remove = (entry: Entry) => {
    for (const child of childrenOf(entry.id)) remove(child);
    entries.delete(entry.id);
  };

  /** One write of a file at a time, so two saves over the same bytes cannot both pass `over`. */
  const writing = new Map<string, Promise<unknown>>();
  const inTurn = (id: string, write: () => Promise<Result<FileNode>>): Promise<Result<FileNode>> => {
    const next = (writing.get(id) ?? Promise.resolve()).catch(() => {}).then(write);
    writing.set(id, next);
    return next;
  };

  return {
    root: "",
    find: async (id) => {
      const found = findEntry(id);
      return found.ok ? ok(withPath(found.value)) : found;
    },
    findFile: async (id) => {
      const found = findEntry(id, "file");
      return found.ok ? ok(withPath(found.value)) : found;
    },

    listing: async (parentId): Promise<Result<FolderListing>> => {
      if (parentId === null) return ok({ folder: null, path: [], children: childrenOf(null).map(toNode) });
      const folder = findEntry(parentId, "folder");
      if (!folder.ok) return folder;
      return ok({
        folder: toNode(folder.value),
        path: lineOf(folder.value).map(toNode),
        children: childrenOf(folder.value.id).map(toNode),
      });
    },

    createFolder: async (parentId, name) => add(parentId, name, null),
    createFile: async (parentId, name, bytes) => add(parentId, name, bytes),

    update: async (id, update) => {
      const found = findEntry(id);
      if (!found.ok) return found;
      const entry = found.value;
      const folder = update.parentId === undefined ? ok(entry.parentId) : targetFolder(update.parentId);
      if (!folder.ok) return folder;
      const target = folder.value === null ? undefined : entries.get(folder.value);
      if (target && lineOf(target).some((each) => each.id === entry.id)) return fail("invalid", INTO_ITSELF);
      const name = update.name ?? entry.name;
      if (!isFree(folder.value, name, entry.id)) return fail("name_taken", NAME_TAKEN);
      entry.parentId = folder.value;
      entry.name = name;
      return ok(toNode(entry));
    },

    trash: async (id) => {
      const found = findEntry(id);
      if (!found.ok) return found;
      const node = toNode(found.value);
      remove(found.value);
      return ok({ ...node, trashedAt: now().toISOString() });
    },

    read: async (id) => {
      const found = findEntry(id, "file");
      if (!found.ok) return found;
      return ok({ node: toNode(found.value), bytes: found.value.bytes ?? new Uint8Array() });
    },

    write: (id, bytes, over = null) =>
      inTurn(id, async (): Promise<Result<FileNode>> => {
        const found = findEntry(id, "file");
        if (!found.ok) return found;
        const entry = found.value;
        if (over !== null && (await sha256Of(entry.bytes ?? new Uint8Array())) !== over)
          return fail("conflict", CHANGED_SINCE);
        entry.bytes = bytes;
        entry.version = (entry.version ?? 0) + 1;
        entry.updatedAt = now().toISOString();
        return ok(toNode(entry));
      }),

    copy: async (id) => {
      const found = findEntry(id, "file");
      if (!found.ok) return found;
      const { parentId, name, bytes } = found.value;
      for (let attempt = 1; attempt <= MAX_COPY_ATTEMPTS; attempt++) {
        const next = copyName(name, attempt);
        if (isFree(parentId, next)) return add(parentId, next, bytes);
      }
      return fail("name_taken", NAME_TAKEN);
    },

    recent: async (limit = 50) =>
      [...entries.values()]
        .filter((entry) => entry.kind === "file")
        .map(toNode)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit),
  };
};
