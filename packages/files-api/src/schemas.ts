import { z } from "zod";

/** Characters a file or folder name may not contain, so names stay valid on every file system. */
const FORBIDDEN_NAME_CHARACTERS = /[/\\:*?"<>|]/;

const hasControlCharacter = (name: string): boolean =>
  [...name].some((character) => character.charCodeAt(0) < 0x20);

export const nodeNameSchema = z
  .string()
  .trim()
  .min(1, "Der Name darf nicht leer sein.")
  .max(255, "Der Name ist zu lang.")
  .refine(
    (name) => !FORBIDDEN_NAME_CHARACTERS.test(name) && !hasControlCharacter(name),
    "Der Name enthält ein unzulässiges Zeichen.",
  )
  .refine((name) => name !== "." && name !== "..", "Der Name ist nicht erlaubt.");

export const nodeIdSchema = z.uuid();

export const nodeKindSchema = z.enum(["folder", "file"]);

/**
 * What the signed-in user may do with a node: everything as its owner, change it with "edit",
 * look at it with "view". A share on a folder holds for everything in it.
 */
export const roleSchema = z.enum(["owner", "edit", "view"]);

/** The roles a share gives. */
export const shareRoleSchema = z.enum(["edit", "view"]);

export const nodeSchema = z.object({
  id: nodeIdSchema,
  parentId: nodeIdSchema.nullable(),
  kind: nodeKindSchema,
  name: z.string(),
  mime: z.string().nullable(),
  size: z.number().int().nonnegative().nullable(),
  version: z.number().int().positive().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  trashedAt: z.iso.datetime({ offset: true }).nullable(),
  role: roleSchema,
});

/** A node someone shared with the signed-in user, with who owns it. */
export const sharedNodeSchema = nodeSchema.extend({ ownerName: z.string() });

/** Who a node is shared with (only its owner sees this). */
export const shareSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: shareRoleSchema,
  /** Shared with an address that has no account yet; it holds once the person signs in through Kontext. */
  pending: z.boolean().optional(),
  /** An account whose address nobody confirmed (a sign-up with a password): not known to be the person. */
  unverified: z.boolean().optional(),
});

export const putShareSchema = z.object({
  email: z.email("Das ist keine gültige E-Mail-Adresse.").transform((email) => email.toLowerCase()),
  role: shareRoleSchema,
});

/** A link that shares a node (only its owner sees these). */
export const inviteSchema = z.object({
  token: z.string(),
  role: shareRoleSchema,
  createdAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
});

/** How long a new link holds, in days. */
export const INVITE_DAYS = [1, 7, 30] as const;

export const createInviteSchema = z.object({
  role: shareRoleSchema,
  days: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7),
});

/** What someone who opens a link learns before accepting it. */
export const invitationSchema = z.object({
  nodeName: z.string(),
  kind: nodeKindSchema,
  ownerName: z.string(),
  role: shareRoleSchema,
  expiresAt: z.iso.datetime({ offset: true }),
});

/** An image stored for a document being edited; served under /api/files/:id/media/:name. */
export const mediaSchema = z.object({ name: z.string().regex(/^[0-9a-f]{64}\.[a-z]+$/) });
export type Media = z.infer<typeof mediaSchema>;

/**
 * Which kind of server the app talks to: a Schreibzeug server with accounts, or the desktop app's local
 * one over a folder on the computer (apps/local), where sharing, versions and the trash are absent.
 */
export const serverInfoSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("server"),
    /** Signing in through another service (Kontext): the name on the button. */
    oidc: z.object({ name: z.string() }).optional(),
    /** The site that may show Schreibzeug in a frame and talk to it (Kontext), as an origin. */
    embedOrigin: z.string().optional(),
  }),
  z.object({ mode: z.literal("local"), rootName: z.string() }),
]);
export type ServerInfo = z.infer<typeof serverInfoSchema>;

/** What a personal access token may do: only look ("read"), or what its user may ("write"). */
export const tokenScopeSchema = z.enum(["read", "write"]);

/** How long a new access token holds, in days; null: until it is revoked. */
export const TOKEN_DAYS = [30, 90, 365] as const;

/** A personal access token as its user sees it in the list; the token itself is shown only once. */
export const accessTokenSchema = z.object({
  id: nodeIdSchema,
  name: z.string(),
  scope: tokenScopeSchema,
  createdAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  lastUsedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const createAccessTokenSchema = z.object({
  name: z.string().trim().min(1, "Der Name darf nicht leer sein.").max(100, "Der Name ist zu lang."),
  scope: tokenScopeSchema,
  days: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]).default(90),
});

/** The answer to creating a token: the list entry and, this once, the token. */
export const createdAccessTokenSchema = accessTokenSchema.extend({ token: z.string() });

/**
 * Sent with a save from a shared session as `<base version>:<n>`: the session it comes from (the
 * version that session started at) and how many changes of its log the stored file holds, so the
 * relay knows the version is that session's own (apps/server collab/hub.ts `stored`).
 */
export const SESSION_SAVE_HEADER = "x-schreibzeug-session-save";

export type SessionSave = { baseVersion: number; index: number };

/** What a server asks of its relay for a save from a shared session (apps/server collab/hub.ts). */
export type SessionSaves = {
  /**
   * The save starts: whether it comes from the file's session open now (a copy of one that is gone
   * is old). Each begun save ends with `stored` or `abandon`.
   */
  begin: (fileId: string, save: SessionSave) => boolean;
  /** The save was stored as `version`. */
  stored: (fileId: string, version: number, save: SessionSave) => void;
  /** The save stored nothing. */
  abandon: (fileId: string) => void;
};

/** The answer to a save from a session that is gone: its copy must not become the newest version. */
export const SESSION_GONE = "Die gemeinsame Sitzung ist vorbei. Öffne das Dokument neu.";

/** The header's value for a save. */
export const sessionSaveHeader = ({ baseVersion, index }: SessionSave): string => `${baseVersion}:${index}`;

/** What a save says it holds, or null for a save from outside a session. */
export const sessionSaveOf = (header: string | undefined): SessionSave | null => {
  const match = /^(\d{1,9}):(\d{1,9})$/.exec(header ?? "");
  return match ? { baseVersion: Number(match[1]), index: Number(match[2]) } : null;
};

/**
 * A save that only goes through over the version it was made from: `If-Match` names that
 * version's content as its SHA-256 (`"<hex>"`), which the editor computes from the bytes it opened
 * and saved. Without the header a save always goes through, as before. Used by the text editor,
 * which has no shared session to merge changes in.
 */
export const ifMatchHeader = (sha256: string): string => `"${sha256}"`;

/** The SHA-256 a save says it was made over; null without a header, undefined for a malformed one. */
export const ifMatchOf = (header: string | undefined): string | null | undefined => {
  if (header === undefined) return null;
  return /^"([0-9a-f]{64})"$/.exec(header.trim())?.[1];
};

/** The answer to a save made over a version that is no longer the newest. */
export const CHANGED_SINCE =
  "Die Datei wurde inzwischen gespeichert. Lade die neue Fassung oder speichere eine Kopie.";

/** How long a name may be (nodeNameSchema). */
const MAX_NAME_LENGTH = 255;

/**
 * The name of the n-th copy of a file next to the original: "Bericht (Kopie 2).docx". A name that
 * would grow past what a name may be loses the end of its base, not the mark or the extension.
 */
export const copyName = (name: string, attempt: number): string => {
  const mark = ` (Kopie${attempt > 1 ? ` ${attempt}` : ""})`;
  const dot = name.lastIndexOf(".");
  // An "extension" that leaves no room for the base is part of the name.
  const split = dot > 0 && name.length - dot + mark.length < MAX_NAME_LENGTH;
  const [base, extension] = split ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  const room = MAX_NAME_LENGTH - mark.length - extension.length;
  // Cut between characters, not inside a surrogate pair.
  const kept = base.length > room ? base.slice(0, room).replace(/[\uD800-\uDBFF]$/, "") : base;
  return `${kept}${mark}${extension}`;
};

export const folderListingSchema = z.object({
  folder: nodeSchema.nullable(),
  path: z.array(nodeSchema),
  children: z.array(nodeSchema),
});

export const versionSchema = z.object({
  id: nodeIdSchema,
  fileId: nodeIdSchema,
  number: z.number().int().positive(),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.iso.datetime({ offset: true }),
});

export const createFolderSchema = z.object({
  parentId: nodeIdSchema.nullable(),
  name: nodeNameSchema,
});

/** The new files "Neu" makes: Office files, a Markdown note and a plain text file. */
export const blankFormatSchema = z.enum(["docx", "xlsx", "pptx", "md", "txt"]);

export const createBlankFileSchema = z.object({
  parentId: nodeIdSchema.nullable(),
  name: nodeNameSchema,
  format: blankFormatSchema,
});

export const updateNodeSchema = z
  .object({
    name: nodeNameSchema.optional(),
    parentId: nodeIdSchema.nullable().optional(),
  })
  .refine((update) => update.name !== undefined || update.parentId !== undefined, "Nichts zu ändern.");

export const apiErrorKindSchema = z.enum([
  "not_found",
  "name_taken",
  "invalid",
  "not_a_folder",
  "conflict",
  "too_large",
  "unauthorized",
  "forbidden",
  "internal",
]);

export const apiErrorSchema = z.object({
  error: z.object({ kind: apiErrorKindSchema, message: z.string() }),
});

export type FileNode = z.infer<typeof nodeSchema>;
export type Role = z.infer<typeof roleSchema>;
export type ShareRole = z.infer<typeof shareRoleSchema>;
export type SharedNode = z.infer<typeof sharedNodeSchema>;
export type Share = z.infer<typeof shareSchema>;
export type PutShare = z.infer<typeof putShareSchema>;
export type Invite = z.infer<typeof inviteSchema>;
export type CreateInvite = z.infer<typeof createInviteSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type FolderListing = z.infer<typeof folderListingSchema>;
export type FileVersion = z.infer<typeof versionSchema>;
export type CreateFolder = z.infer<typeof createFolderSchema>;
export type CreateBlankFile = z.infer<typeof createBlankFileSchema>;
export type BlankFormat = z.infer<typeof blankFormatSchema>;
export type UpdateNode = z.infer<typeof updateNodeSchema>;
export type TokenScope = z.infer<typeof tokenScopeSchema>;
export type AccessToken = z.infer<typeof accessTokenSchema>;
export type CreateAccessToken = z.infer<typeof createAccessTokenSchema>;
export type CreatedAccessToken = z.infer<typeof createdAccessTokenSchema>;
export type ApiErrorKind = z.infer<typeof apiErrorKindSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>["error"];

const bytes = z.number().int().nonnegative();

/**
 * How much room there is (`GET /api/storage`). `usage`: what the user's own files take, as the sum
 * of their versions' sizes; the blob store keeps equal bytes once, so the disk may hold less. Absent
 * for files on this computer, which have no versions or trash of their own. `disk`: the drive the
 * data lies on, the same for every account; null when the system does not say.
 */
export const storageSchema = z.object({
  usage: z
    .object({
      /** The newest version of every file outside the trash. */
      files: bytes,
      /** The older versions of those files: every save keeps one. */
      versions: bytes,
      /** Every version of what lies in the trash. */
      trash: bytes,
    })
    .nullable(),
  disk: z.object({ free: bytes, total: bytes }).nullable(),
  /** The largest file the server takes; less free room than this and a save may fail. */
  uploadLimit: bytes,
});
export type Storage = z.infer<typeof storageSchema>;
