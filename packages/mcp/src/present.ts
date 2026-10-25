import type { FileNode, FileVersion } from "@schreibzeug/files-api";

/** Where the app opens a node: the editor for a file, the list for a folder (apps/web src/router.tsx). */
export const linkTo = (origin: string, node: Pick<FileNode, "id" | "kind">): string =>
  `${origin}/${node.kind === "file" ? "edit" : "folders"}/${node.id}`;

/** A node as the tools answer it: what a model needs to address it again, and the link for the person. */
export const presentNode = (origin: string, node: FileNode) => ({
  id: node.id,
  name: node.name,
  kind: node.kind,
  ...(node.kind === "file" ? { size: node.size, version: node.version } : {}),
  updatedAt: node.updatedAt,
  role: node.role,
  ...(node.trashedAt ? { trashedAt: node.trashedAt } : {}),
  link: linkTo(origin, node),
});

export const presentVersion = (version: FileVersion) => ({
  number: version.number,
  size: version.size,
  createdAt: version.createdAt,
});

/** Answers as JSON text: unambiguous for the model, short enough with two-space indent off. */
export const asText = (value: unknown): string => JSON.stringify(value, null, 1);
