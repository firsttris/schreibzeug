import { zValidator } from "@hono/zod-validator";
import {
  createBlankFileSchema,
  createFolderSchema,
  nodeIdSchema,
  nodeNameSchema,
  updateNodeSchema,
} from "@stapel/files-api";
import { blankDocx } from "@stapel/ooxml";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { BlobStore } from "../blobs";
import type { Database } from "../db/database";
import type { NodeRow } from "../db/schema";
import { fail, type Result, statusOf } from "../result";
import { mimeOf } from "./mime";
import * as repository from "./repository";
import { contentDisposition, toFileNode, toFileVersion } from "./serialize";

export type FilesDeps = { db: Database; blobs: BlobStore; maxUploadBytes: number };

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
const parentQuery = z.object({ parent: z.union([z.literal("root"), nodeIdSchema]).default("root") });
const versionQuery = z.object({ version: z.coerce.number().int().positive().optional() });
const uploadForm = z.object({
  parentId: nodeIdSchema.optional(),
  file: z.instanceof(File, { message: "Keine Datei im Upload." }),
});

const BLANK_FILES = { docx: { extension: ".docx", bytes: blankDocx } } as const;

/** Adds the extension the format needs, unless the name already has it. */
const withExtension = (name: string, extension: string) =>
  name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`;

export const filesRoutes = ({ db, blobs, maxUploadBytes }: FilesDeps) => {
  const limit = bodyLimit({
    maxSize: maxUploadBytes,
    onError: (c) => c.json({ error: { kind: "too_large" as const, message: "Die Datei ist zu groß." } }, 413),
  });

  const store = async (bytes: Uint8Array) => ({ size: bytes.byteLength, sha256: await blobs.put(bytes) });

  const createStoredFile = async (parentId: string | null, name: string, bytes: Uint8Array) => {
    const parent = await repository.findTargetFolder(db, parentId);
    if (!parent.ok) return parent as Result<NodeRow>;
    return repository.createFile(db, { parentId, name, mime: mimeOf(name), ...(await store(bytes)) });
  };

  return new Hono()
    .get("/nodes", validate("query", parentQuery), async (c) => {
      const { parent } = c.req.valid("query");
      const folderId = parent === "root" ? null : parent;
      const folder = await repository.findTargetFolder(db, folderId);
      if (!folder.ok) return c.json({ error: folder.error }, statusOf(folder.error.kind));
      const [children, path] = await Promise.all([
        repository.listChildren(db, folderId),
        folderId ? repository.pathTo(db, folderId) : Promise.resolve([]),
      ]);
      return c.json({
        folder: folder.value ? toFileNode(folder.value) : null,
        path: path.map(toFileNode),
        children: children.map(toFileNode),
      });
    })
    .get("/nodes/:id", validate("param", idParam), async (c) => {
      const node = await repository.findActive(db, c.req.valid("param").id);
      return node
        ? c.json(toFileNode(node))
        : c.json({ error: { kind: "not_found" as const, message: "Nicht gefunden." } }, 404);
    })
    .patch("/nodes/:id", validate("param", idParam), validate("json", updateNodeSchema), async (c) => {
      const { name, parentId } = c.req.valid("json");
      const update = {
        ...(name === undefined ? {} : { name }),
        ...(parentId === undefined ? {} : { parentId }),
      };
      return respond(c, await repository.updateNode(db, c.req.valid("param").id, update), toFileNode);
    })
    .post("/nodes/:id/trash", validate("param", idParam), async (c) =>
      respond(c, await repository.trashNode(db, c.req.valid("param").id), toFileNode),
    )
    .post("/nodes/:id/restore", validate("param", idParam), async (c) =>
      respond(c, await repository.restoreNode(db, c.req.valid("param").id), toFileNode),
    )
    .get("/trash", async (c) => c.json((await repository.listTrash(db)).map(toFileNode)))
    .get("/recent", async (c) => c.json((await repository.listRecent(db)).map(toFileNode)))
    .post("/folders", validate("json", createFolderSchema), async (c) =>
      respond(c, await repository.createFolder(db, c.req.valid("json")), toFileNode, 201),
    )
    .post("/files", limit, validate("form", uploadForm), async (c) => {
      const { parentId, file } = c.req.valid("form");
      const name = nodeNameSchema.safeParse(file.name);
      if (!name.success)
        return respond(c, fail("invalid", name.error.issues[0]?.message ?? "Ungültiger Name."), toFileNode);
      const bytes = new Uint8Array(await file.arrayBuffer());
      return respond(c, await createStoredFile(parentId ?? null, name.data, bytes), toFileNode, 201);
    })
    .post("/files/blank", validate("json", createBlankFileSchema), async (c) => {
      const { parentId, name, format } = c.req.valid("json");
      const blank = BLANK_FILES[format];
      const created = await createStoredFile(parentId, withExtension(name, blank.extension), blank.bytes());
      return respond(c, created, toFileNode, 201);
    })
    .get("/files/:id/content", validate("param", idParam), validate("query", versionQuery), async (c) => {
      const found = await repository.findVersion(db, c.req.valid("param").id, c.req.valid("query").version);
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
      const saved = await repository.addVersion(db, c.req.valid("param").id, await store(bytes));
      return respond(c, saved, toFileNode);
    })
    .get("/files/:id/versions", validate("param", idParam), async (c) =>
      respond(c, await repository.listVersions(db, c.req.valid("param").id), (rows) =>
        rows.map(toFileVersion),
      ),
    );
};
