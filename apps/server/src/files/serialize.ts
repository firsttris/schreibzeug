import type { FileNode, FileVersion } from "@stapel/files-api";
import type { NodeRow, VersionRow } from "../db/schema";

/** Rows as the API sends them: the shapes in @stapel/files-api, dates as ISO strings. */
export const toFileNode = (row: NodeRow): FileNode => ({
  id: row.id,
  parentId: row.parentId,
  kind: row.kind,
  name: row.name,
  mime: row.mime,
  size: row.size,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  trashedAt: row.trashedAt?.toISOString() ?? null,
});

export const toFileVersion = (row: VersionRow): FileVersion => ({
  id: row.id,
  fileId: row.fileId,
  number: row.number,
  size: row.size,
  sha256: row.sha256,
  createdAt: row.createdAt.toISOString(),
});

/** RFC 6266 / RFC 5987: the plain name for old clients, the UTF-8 name for everyone else. */
export const contentDisposition = (name: string): string => {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};
