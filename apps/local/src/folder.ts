import type { Stats } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { copyName, type FileNode, type FolderListing } from "@schreibzeug/files-api";
import { mimeOf } from "@schreibzeug/server/files/mime";
import { fail, ok, type Result } from "@schreibzeug/server/result";
import type { Ids } from "./ids";

/**
 * The files API's operations on a folder of the computer: the folder is "Meine Dateien", its
 * subfolders are folders, its files are files. Nothing is stored beside them; a save overwrites
 * the file as Word or Excel would. Paths are relative to the root ("Briefe/Antrag.docx").
 */

/** What the file list leaves out: hidden files, Office's lock files, the system's folder notes. */
const HIDDEN_NAMES = new Set(["desktop.ini", "thumbs.db", "$recycle.bin"]);
export const isVisible = (name: string): boolean =>
  !name.startsWith(".") && !name.startsWith("~$") && !HIDDEN_NAMES.has(name.toLowerCase());

const MAX_COPY_ATTEMPTS = 50;
/** How deep "Zuletzt bearbeitet" and an unknown id are looked for, and how many files at most. */
const MAX_DEPTH = 6;
const MAX_WALKED = 5000;

const NOT_FOUND = "Diese Datei oder diesen Ordner gibt es nicht.";
const NAME_TAKEN = "Hier gibt es schon etwas mit diesem Namen.";

const parentOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
const childPath = (folder: string, name: string): string => (folder ? `${folder}/${name}` : name);

/** The file that newly created content goes into, written whole before it takes the real name. */
const temporaryName = (target: string) => join(target, "..", `.~schreibzeug-${crypto.randomUUID()}`);

const writeWhole = async (target: string, bytes: Uint8Array) => {
  const temporary = temporaryName(target);
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
};

export type FolderDeps = {
  root: string;
  ids: Ids;
  /** Moves a file or folder into the system's trash (trash.ts). */
  trash: (absolutePath: string) => Promise<Result<null>>;
  /** How many saves a file has had in this process, as the API's version number. */
  versions?: Map<string, number>;
};

export const createFolder = ({ root: rootFolder, ids, trash, versions = new Map() }: FolderDeps) => {
  const root = resolve(rootFolder);

  /** The absolute path, or null for one that would leave the root. */
  const absolute = (path: string): string | null => {
    const target = resolve(root, ...path.split("/").filter(Boolean));
    return target === root || target.startsWith(root + sep) ? target : null;
  };

  const statOf = (path: string): Promise<Stats | null> => {
    const target = absolute(path);
    return target ? stat(target).catch(() => null) : Promise.resolve(null);
  };

  const versionOf = (id: string) => versions.get(id) ?? 1;

  const toNode = (path: string, stats: Stats): FileNode => {
    const id = ids.idOf(path);
    const parent = parentOf(path);
    const file = stats.isFile();
    return {
      id,
      parentId: path.includes("/") ? ids.idOf(parent) : null,
      kind: file ? "file" : "folder",
      name: nameOf(path),
      mime: file ? mimeOf(path) : null,
      size: file ? stats.size : null,
      version: file ? versionOf(id) : null,
      createdAt: (stats.birthtimeMs > 0 ? stats.birthtime : stats.ctime).toISOString(),
      updatedAt: stats.mtime.toISOString(),
      trashedAt: null,
      role: "owner",
    };
  };

  const nodeAt = async (path: string): Promise<Result<FileNode>> => {
    const stats = path && isVisible(nameOf(path)) ? await statOf(path) : null;
    return stats && (stats.isFile() || stats.isDirectory())
      ? ok(toNode(path, stats))
      : fail("not_found", NOT_FOUND);
  };

  const visibleChildren = async (folder: string): Promise<string[]> => {
    const target = absolute(folder);
    const names = target ? await readdir(target).catch(() => [] as string[]) : [];
    return names.filter(isVisible).map((name) => childPath(folder, name));
  };

  /** Looks for an id this process has not handed out yet, e.g. a link opened after a restart. */
  const search = async (id: string, folder = "", depth = 0): Promise<string | null> => {
    if (depth > MAX_DEPTH) return null;
    for (const path of await visibleChildren(folder)) {
      if (ids.idOf(path) === id) return path;
      const stats = await statOf(path);
      const found = stats?.isDirectory() ? await search(id, path, depth + 1) : null;
      if (found !== null) return found;
    }
    return null;
  };

  const pathOf = async (id: string): Promise<string | null> => ids.pathOf(id) ?? (await search(id));

  const find = async (id: string): Promise<Result<FileNode & { path: string }>> => {
    const path = await pathOf(id);
    const node = path ? await nodeAt(path) : fail<FileNode>("not_found", NOT_FOUND);
    return node.ok && path ? ok({ ...node.value, path }) : fail("not_found", NOT_FOUND);
  };

  const findKind = async (id: string, kind: FileNode["kind"]) => {
    const found = await find(id);
    if (!found.ok || found.value.kind === kind) return found;
    return kind === "folder"
      ? fail<typeof found.value>("not_a_folder", "Das ist kein Ordner.")
      : fail<typeof found.value>("not_found", NOT_FOUND);
  };

  /** The folder something goes into: the root for null. */
  const targetFolder = async (parentId: string | null): Promise<Result<string>> => {
    if (parentId === null) return ok("");
    const folder = await findKind(parentId, "folder");
    return folder.ok ? ok(folder.value.path) : folder;
  };

  /** True when the name is free, or names `self` (a rename that changes only the case). */
  const isFree = async (path: string, self?: Stats): Promise<boolean> => {
    const existing = await statOf(path);
    return !existing || (self !== undefined && existing.ino === self.ino && existing.dev === self.dev);
  };

  const list = async (folder: string): Promise<FileNode[]> => {
    const nodes = await Promise.all((await visibleChildren(folder)).map(nodeAt));
    return nodes
      .flatMap((node) => (node.ok ? [node.value] : []))
      .sort(
        (a, b) =>
          Number(b.kind === "folder") - Number(a.kind === "folder") ||
          a.name.localeCompare(b.name, "de", { sensitivity: "base" }) ||
          a.name.localeCompare(b.name),
      );
  };

  /** The folders from below the root down to the folder itself, as the breadcrumb shows them. */
  const pathTo = async (path: string): Promise<FileNode[]> => {
    const parts = path.split("/");
    const paths = parts.map((_, index) => parts.slice(0, index + 1).join("/"));
    const nodes = await Promise.all(paths.map(nodeAt));
    return nodes.flatMap((node) => (node.ok ? [node.value] : []));
  };

  const createFile = async (parentId: string | null, name: string, bytes: Uint8Array) => {
    const folder = await targetFolder(parentId);
    if (!folder.ok) return folder;
    const path = childPath(folder.value, name);
    const target = absolute(path);
    if (!target || !(await isFree(path))) return fail<FileNode>("name_taken", NAME_TAKEN);
    await writeWhole(target, bytes);
    return nodeAt(path);
  };

  return {
    root,
    find,
    findFile: (id: string) => findKind(id, "file"),

    listing: async (parentId: string | null): Promise<Result<FolderListing>> => {
      if (parentId === null) return ok({ folder: null, path: [], children: await list("") });
      const folder = await findKind(parentId, "folder");
      if (!folder.ok) return folder;
      const { path, ...node } = folder.value;
      return ok({ folder: node, path: await pathTo(path), children: await list(path) });
    },

    createFolder: async (parentId: string | null, name: string): Promise<Result<FileNode>> => {
      const folder = await targetFolder(parentId);
      if (!folder.ok) return folder;
      const path = childPath(folder.value, name);
      const target = absolute(path);
      if (!target || !(await isFree(path))) return fail("name_taken", NAME_TAKEN);
      await mkdir(target);
      return nodeAt(path);
    },

    createFile,

    update: async (
      id: string,
      update: { name?: string; parentId?: string | null },
    ): Promise<Result<FileNode>> => {
      const found = await find(id);
      if (!found.ok) return found;
      const { path } = found.value;
      const folder = update.parentId === undefined ? ok(parentOf(path)) : await targetFolder(update.parentId);
      if (!folder.ok) return folder;
      if (found.value.kind === "folder" && (folder.value === path || folder.value.startsWith(`${path}/`)))
        return fail("invalid", "Ein Ordner kann nicht in sich selbst verschoben werden.");
      const next = childPath(folder.value, update.name ?? nameOf(path));
      if (next === path) return nodeAt(path);
      const [from, to, self] = [absolute(path), absolute(next), await statOf(path)];
      if (!from || !to || !self || !(await isFree(next, self))) return fail("name_taken", NAME_TAKEN);
      await rename(from, to);
      ids.moved(path, next);
      return nodeAt(next);
    },

    trash: async (id: string): Promise<Result<FileNode>> => {
      const found = await find(id);
      if (!found.ok) return found;
      const { path, ...node } = found.value;
      const target = absolute(path);
      const moved = target ? await trash(target) : fail<null>("not_found", NOT_FOUND);
      return moved.ok ? ok({ ...node, trashedAt: new Date().toISOString() }) : moved;
    },

    read: async (id: string): Promise<Result<{ node: FileNode; bytes: Uint8Array }>> => {
      const found = await findKind(id, "file");
      const target = found.ok ? absolute(found.value.path) : null;
      if (!found.ok || !target) return found.ok ? fail("not_found", NOT_FOUND) : found;
      const { path: _, ...node } = found.value;
      return ok({ node, bytes: new Uint8Array(await readFile(target)) });
    },

    write: async (id: string, bytes: Uint8Array): Promise<Result<FileNode>> => {
      const found = await findKind(id, "file");
      const target = found.ok ? absolute(found.value.path) : null;
      if (!found.ok || !target) return found.ok ? fail("not_found", NOT_FOUND) : found;
      await writeWhole(target, bytes);
      versions.set(id, versionOf(id) + 1);
      return nodeAt(found.value.path);
    },

    copy: async (id: string): Promise<Result<FileNode>> => {
      const found = await findKind(id, "file");
      if (!found.ok) return found;
      const { path, name } = found.value;
      for (let attempt = 1; attempt <= MAX_COPY_ATTEMPTS; attempt++) {
        const next = childPath(parentOf(path), copyName(name, attempt));
        const [from, to] = [absolute(path), absolute(next)];
        if (from && to && (await isFree(next))) {
          await copyFile(from, to);
          return nodeAt(next);
        }
      }
      return fail("name_taken", NAME_TAKEN);
    },

    /** The files changed last, anywhere under the root (bounded, so a huge folder stays quick). */
    recent: async (limit = 50): Promise<FileNode[]> => {
      const files: FileNode[] = [];
      const walk = async (folder: string, depth: number): Promise<void> => {
        for (const node of await list(folder)) {
          if (files.length >= MAX_WALKED) return;
          if (node.kind === "file") files.push(node);
          else if (depth < MAX_DEPTH) {
            const path = await pathOf(node.id);
            if (path) await walk(path, depth + 1);
          }
        }
      };
      await walk("", 0);
      return files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
    },
  };
};

export type Folder = ReturnType<typeof createFolder>;
