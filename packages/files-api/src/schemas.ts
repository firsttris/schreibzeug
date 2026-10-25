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

/** How long a name may be (nodeNameSchema). */
const MAX_NAME_LENGTH = 255;

/**
 * The name of the n-th copy of a file next to the original: "Bericht (Kopie 2).docx". A name that
 * would grow past what a name may be loses the end of its base, not the mark or the extension.
 */
export const copyName = (name: string, attempt: number): string => {
  const dot = name.lastIndexOf(".");
  const [base, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  const mark = ` (Kopie${attempt > 1 ? ` ${attempt}` : ""})`;
  const room = Math.max(1, MAX_NAME_LENGTH - mark.length - extension.length);
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

export const blankFormatSchema = z.enum(["docx", "xlsx", "pptx"]);

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
