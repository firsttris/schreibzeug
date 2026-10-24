import { zValidator } from "@hono/zod-validator";
import {
  createBlankFileSchema,
  createFolderSchema,
  createInviteSchema,
  nodeIdSchema,
  nodeNameSchema,
  putShareSchema,
  updateNodeSchema,
} from "@stapel/files-api";
import { blankDocx, blankPptx, blankXlsx } from "@stapel/ooxml";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { AuthEnv } from "../auth/middleware";
import type { BlobStore } from "../blobs";
import type { Database } from "../db/database";
import { fail, ok, type Result, statusOf } from "../result";
import * as invites from "./invites";
import { mimeOf } from "./mime";
import * as repository from "./repository";
import {
  contentDisposition,
  toFileNode,
  toFileVersion,
  toInvitation,
  toInvite,
  toSharedNode,
} from "./serialize";
import * as shares from "./shares";

export type FilesDeps = { db: Database; blobs: BlobStore; maxUploadBytes: number };

/** Every route acts for the signed-in user (`requireUser` in app.ts). */
const userOf = (c: Context<AuthEnv>) => c.var.user.id;

/** Validation failures in the same shape as every other API error. */
const validate = <T extends "json" | "query" | "param" | "form", S extends z.ZodType>(target: T, schema: S) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "Ungültige Anfrage.";
      return c.json({ error: { kind: "invalid" as const, message } }, 400);
    }
  });

const respond = <T, R>(c: Context, result: Result<T>, map: (value: T) => R, status: 200 | 201 = 200) =>
  result.ok
    ? c.json(map(result.value), status)
    : c.json({ error: result.error }, statusOf(result.error.kind));

const idParam = z.object({ id: nodeIdSchema });
const tokenParam = z.object({ token: z.string().min(1).max(100) });
const parentQuery = z.object({ parent: z.union([z.literal("root"), nodeIdSchema]).default("root") });
const versionQuery = z.object({ version: z.coerce.number().int().positive().optional() });
const uploadForm = z.object({
  parentId: nodeIdSchema.optional(),
  file: z.instanceof(File, { message: "Keine Datei im Upload." }),
});

const BLANK_FILES = {
  docx: { extension: ".docx", bytes: blankDocx },
  xlsx: { extension: ".xlsx", bytes: blankXlsx },
  pptx: { extension: ".pptx", bytes: blankPptx },
} as const;

/** Adds the extension the format needs, unless the name already has it. */
const withExtension = (name: string, extension: string) =>
  name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`;

/**
 * What a link shares, for someone who opened it and may not be signed in yet: the page asks them
 * to sign in or create an account first. Mounted before the session check (app.ts).
 */
export const invitationRoutes = ({ db }: Pick<FilesDeps, "db">) =>
  new Hono().get("/invites/:token", validate("param", tokenParam), (c) =>
    respond(c, invites.findInvitation(db, c.req.valid("param").token), toInvitation),
  );

export const filesRoutes = ({ db, blobs, maxUploadBytes }: FilesDeps) => {
  const limit = bodyLimit({
    maxSize: maxUploadBytes,
    onError: (c) => c.json({ error: { kind: "too_large" as const, message: "Die Datei ist zu groß." } }, 413),
  });

  const store = async (bytes: Uint8Array) => ({ size: bytes.byteLength, sha256: await blobs.put(bytes) });

  const createStoredFile = async (user: string, parentId: string | null, name: string, bytes: Uint8Array) => {
    // Checked before the bytes go into the blob store.
    const parent = repository.findTargetFolder(db, user, parentId);
    if (!parent.ok) return parent;
    return repository.createFile(db, user, { parentId, name, mime: mimeOf(name), ...(await store(bytes)) });
  };

  return new Hono<AuthEnv>()
    .get("/nodes", validate("query", parentQuery), async (c) => {
      const { parent } = c.req.valid("query");
      const user = userOf(c);
      const folder = parent === "root" ? ok(null) : repository.findNode(db, user, parent);
      if (!folder.ok) return c.json({ error: folder.error }, statusOf(folder.error.kind));
      const found = folder.value;
      if (found && found.node.kind !== "folder") {
        return c.json({ error: { kind: "not_a_folder" as const, message: "Das ist kein Ordner." } }, 422);
      }
      const [children, path] = await Promise.all([
        repository.listChildren(db, user, found),
        found ? repository.pathTo(db, user, found) : Promise.resolve([]),
      ]);
      // The folders above share the role of the one asked for: someone who sees the path sees them.
      const role = found?.role ?? "owner";
      return c.json({
        folder: found ? toFileNode(found) : null,
        path: path.map((node) => toFileNode({ node, role })),
        children: children.map(toFileNode),
      });
    })
    .get("/nodes/:id", validate("param", idParam), async (c) =>
      respond(c, repository.findNode(db, userOf(c), c.req.valid("param").id), toFileNode),
    )
    .patch("/nodes/:id", validate("param", idParam), validate("json", updateNodeSchema), async (c) => {
      const { name, parentId } = c.req.valid("json");
      const update = {
        ...(name === undefined ? {} : { name }),
        ...(parentId === undefined ? {} : { parentId }),
      };
      return respond(c, repository.updateNode(db, userOf(c), c.req.valid("param").id, update), toFileNode);
    })
    .post("/nodes/:id/trash", validate("param", idParam), async (c) =>
      respond(c, repository.trashNode(db, userOf(c), c.req.valid("param").id), toFileNode),
    )
    .post("/nodes/:id/restore", validate("param", idParam), async (c) =>
      respond(c, repository.restoreNode(db, userOf(c), c.req.valid("param").id), toFileNode),
    )
    .get("/trash", async (c) => c.json(repository.listTrash(db, userOf(c)).map(toFileNode)))
    .get("/recent", async (c) => c.json(repository.listRecent(db, userOf(c)).map(toFileNode)))
    .post("/folders", validate("json", createFolderSchema), async (c) =>
      respond(c, repository.createFolder(db, userOf(c), c.req.valid("json")), toFileNode, 201),
    )
    .post("/files", limit, validate("form", uploadForm), async (c) => {
      const { parentId, file } = c.req.valid("form");
      const name = nodeNameSchema.safeParse(file.name);
      if (!name.success)
        return respond(c, fail("invalid", name.error.issues[0]?.message ?? "Ungültiger Name."), toFileNode);
      const bytes = new Uint8Array(await file.arrayBuffer());
      return respond(
        c,
        await createStoredFile(userOf(c), parentId ?? null, name.data, bytes),
        toFileNode,
        201,
      );
    })
    .post("/files/blank", validate("json", createBlankFileSchema), async (c) => {
      const { parentId, name, format } = c.req.valid("json");
      const blank = BLANK_FILES[format];
      const created = await createStoredFile(
        userOf(c),
        parentId,
        withExtension(name, blank.extension),
        blank.bytes(),
      );
      return respond(c, created, toFileNode, 201);
    })
    .get("/files/:id/content", validate("param", idParam), validate("query", versionQuery), async (c) => {
      const found = repository.findVersion(
        db,
        userOf(c),
        c.req.valid("param").id,
        c.req.valid("query").version,
      );
      if (!found.ok) return c.json({ error: found.error }, statusOf(found.error.kind));
      const { file, version } = found.value;
      const bytes = await blobs.get(version.sha256);
      return c.body(bytes as Uint8Array<ArrayBuffer>, 200, {
        "content-type": file.mime ?? "application/octet-stream",
        "content-disposition": contentDisposition(file.name),
        etag: `"${version.sha256}"`,
        "x-stapel-version": String(version.number),
        "cache-control": "no-store",
      });
    })
    .put("/files/:id/content", limit, validate("param", idParam), async (c) => {
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const saved = repository.addVersion(db, userOf(c), c.req.valid("param").id, await store(bytes));
      return respond(c, saved, toFileNode);
    })
    .post("/files/:id/copy", validate("param", idParam), (c) =>
      respond(c, repository.copyFile(db, userOf(c), c.req.valid("param").id), toFileNode, 201),
    )
    .post(
      "/files/:id/versions/:number/restore",
      validate("param", z.object({ id: nodeIdSchema, number: z.coerce.number().int().positive() })),
      async (c) => {
        const { id, number } = c.req.valid("param");
        return respond(c, repository.restoreVersion(db, userOf(c), id, number), toFileNode);
      },
    )
    .get("/nodes/:id/shares", validate("param", idParam), async (c) =>
      respond(c, shares.listShares(db, userOf(c), c.req.valid("param").id), (list) => list),
    )
    .put("/nodes/:id/shares", validate("param", idParam), validate("json", putShareSchema), async (c) =>
      respond(
        c,
        shares.putShare(db, userOf(c), c.req.valid("param").id, c.req.valid("json")),
        (list) => list,
      ),
    )
    .delete(
      "/nodes/:id/shares/:userId",
      validate("param", z.object({ id: nodeIdSchema, userId: z.string().min(1) })),
      async (c) => {
        const { id, userId } = c.req.valid("param");
        return respond(c, shares.removeShare(db, userOf(c), id, userId), (list) => list);
      },
    )
    .get("/nodes/:id/invites", validate("param", idParam), (c) =>
      respond(c, invites.listInvites(db, userOf(c), c.req.valid("param").id), (list) => list.map(toInvite)),
    )
    .post("/nodes/:id/invites", validate("param", idParam), validate("json", createInviteSchema), (c) =>
      respond(
        c,
        invites.createInvite(db, userOf(c), c.req.valid("param").id, c.req.valid("json")),
        toInvite,
        201,
      ),
    )
    .delete(
      "/nodes/:id/invites/:token",
      validate("param", z.object({ id: nodeIdSchema, token: z.string().min(1) })),
      (c) => {
        const { id, token } = c.req.valid("param");
        return respond(c, invites.removeInvite(db, userOf(c), id, token), () => null);
      },
    )
    .post("/invites/:token/accept", validate("param", tokenParam), (c) =>
      respond(c, invites.acceptInvite(db, userOf(c), c.req.valid("param").token), toFileNode),
    )
    .get("/shared", async (c) => c.json(shares.listSharedWithMe(db, userOf(c)).map(toSharedNode)))
    .get("/files/:id/versions", validate("param", idParam), async (c) =>
      respond(c, repository.listVersions(db, userOf(c), c.req.valid("param").id), (rows) =>
        rows.map(toFileVersion),
      ),
    );
};
