import { createHash } from "node:crypto";

/**
 * Ids for the files and folders under the root. The API speaks of nodes by UUID; a folder on disk
 * has only paths. A path's id is a UUID v5 of the path (RFC 9562 §5.5), so it is the same after a
 * restart and a link to a file keeps working. A rename keeps the id for as long as the process runs,
 * so an open editor and the file list stay on the same node.
 *
 * Paths here are relative to the root, with "/" between the parts and no leading slash.
 */

/** Our own namespace for the v5 UUIDs (generated once). */
const NAMESPACE = "6f1c2a52-0d7e-4b8e-9a43-5d3c7b1e2f90";

const bytesOf = (uuid: string): Buffer => Buffer.from(uuid.replaceAll("-", ""), "hex");

const format = (hex: string): string =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

export const uuidV5 = (name: string, namespace = NAMESPACE): string => {
  const hash = createHash("sha1").update(bytesOf(namespace)).update(name, "utf8").digest();
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  return format(hash.subarray(0, 16).toString("hex"));
};

export type Ids = {
  idOf: (path: string) => string;
  /** The path of an id handed out by this process, or null. */
  pathOf: (id: string) => string | null;
  /** A file or folder moved: it, and for a folder everything in it, keeps its id. */
  moved: (from: string, to: string) => void;
};

const isInside = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`);

export const createIds = (): Ids => {
  const byPath = new Map<string, string>();
  const byId = new Map<string, string>();

  const remember = (path: string, id: string) => {
    byPath.set(path, id);
    byId.set(id, path);
  };

  return {
    idOf: (path) => {
      const known = byPath.get(path);
      if (known) return known;
      // A new file at a path that had a moved file's id before gets a fresh one only if that id
      // still names the moved file; v5 of the path is free otherwise.
      const derived = uuidV5(path);
      const id = byId.has(derived) ? uuidV5(`${path}\u0000${byId.size}`) : derived;
      remember(path, id);
      return id;
    },
    pathOf: (id) => byId.get(id) ?? null,
    moved: (from, to) => {
      const affected = [...byPath.entries()].filter(([path]) => isInside(path, from));
      for (const [path] of affected) byPath.delete(path);
      for (const [path, id] of affected) remember(`${to}${path.slice(from.length)}`, id);
    },
  };
};
