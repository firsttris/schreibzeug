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
});

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

export const blankFormatSchema = z.enum(["docx"]);

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
  "internal",
]);

export const apiErrorSchema = z.object({
  error: z.object({ kind: apiErrorKindSchema, message: z.string() }),
});

export type FileNode = z.infer<typeof nodeSchema>;
export type FolderListing = z.infer<typeof folderListingSchema>;
export type FileVersion = z.infer<typeof versionSchema>;
export type CreateFolder = z.infer<typeof createFolderSchema>;
export type CreateBlankFile = z.infer<typeof createBlankFileSchema>;
export type BlankFormat = z.infer<typeof blankFormatSchema>;
export type UpdateNode = z.infer<typeof updateNodeSchema>;
export type ApiErrorKind = z.infer<typeof apiErrorKindSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>["error"];
