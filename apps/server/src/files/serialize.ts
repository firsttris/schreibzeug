import type {
  FileNode,
  FileVersion,
  Invitation as InvitationDto,
  Invite,
  SharedNode,
} from "@stapel/files-api";
import type { InviteRow, VersionRow } from "../db/schema";
import type { Accessible } from "./access";
import type { Invitation } from "./invites";
import type { SharedWithMe } from "./shares";

/** Rows as the API sends them: the shapes in @stapel/files-api, dates as ISO strings. */
export const toFileNode = ({ node: row, role }: Accessible): FileNode => ({
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
  role,
});

export const toSharedNode = ({ node, role, ownerName }: SharedWithMe): SharedNode => ({
  ...toFileNode({ node, role }),
  ownerName,
});

export const toInvite = (row: InviteRow): Invite => ({
  token: row.token,
  role: row.role,
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt.toISOString(),
});

export const toInvitation = ({ invite, node, ownerName }: Invitation): InvitationDto => ({
  nodeName: node.name,
  kind: node.kind,
  ownerName,
  role: invite.role,
  expiresAt: invite.expiresAt.toISOString(),
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
