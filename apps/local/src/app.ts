import { zValidator } from "@hono/zod-validator";
import {
  createBlankFileSchema,
  createFolderSchema,
  nodeIdSchema,
  nodeNameSchema,
  SESSION_GONE,
  SESSION_SAVE_HEADER,
  type ServerInfo,
  sessionSaveOf,
  updateNodeSchema,
} from "@schreibzeug/files-api";
import { blankDocx, blankPptx, blankXlsx } from "@schreibzeug/ooxml";
import type { AuthEnv } from "@schreibzeug/server/auth/middleware";
import type { BlobStore } from "@schreibzeug/server/blobs";
import type { Hub } from "@schreibzeug/server/collab/hub";
import { collabRoutes } from "@schreibzeug/server/collab/routes";
import { imageTypeOf, mediaNameOf, parseMediaName } from "@schreibzeug/server/files/media";
import { contentDisposition } from "@schreibzeug/server/files/serialize";
import { fail, type Result, statusOf } from "@schreibzeug/server/result";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import type { UpgradeWebSocket } from "hono/ws";
import { z } from "zod";
import type { Folder } from "./folder";
import { requireToken, unlock } from "./gate";
import { createSessionBases } from "./session-bases";

/** The one person using the computer, in place of an account. */
export type LocalUser = { id: string; name: string };

export type LocalDeps = {
  folder: Folder;
  /** What the root is called in the app, e.g. "Dokumente". */
  rootName: string;
  user: LocalUser;
  token: string;
  /** Images added while editing; they are part of the file once it is saved. */
  media: BlobStore;
  maxUploadBytes: number;
  collab?: { hub: Hub; upgradeWebSocket: UpgradeWebSocket };
  log?: (message: string, error: unknown) => void;
};

const validate = <T extends "json" | "query" | "param" | "form", S extends z.ZodType>(target: T, schema: S) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "Ungültige Anfrage.";
      return c.json({ error: { kind: "invalid" as const, message } }, 400);
    }
  });

const respond = <T>(c: Context, result: Result<T>, status: 200 | 201 = 200) =>
  result.ok
    ? c.json(result.value as object, status)
    : c.json({ error: result.error }, statusOf(result.error.kind));

const idParam = z.object({ id: nodeIdSchema });
const parentQuery = z.object({ parent: z.union([z.literal("root"), nodeIdSchema]).default("root") });
const uploadForm = z.object({
  parentId: nodeIdSchema.optional(),
  file: z.instanceof(File, { message: "Keine Datei im Upload." }),
});
const mediaParam = z.object({ id: nodeIdSchema, name: z.string().max(100) });
const versionQuery = z.object({ version: z.coerce.number().int().positive().optional() });

const BLANK_FILES = {
  docx: { extension: ".docx", bytes: blankDocx },
  xlsx: { extension: ".xlsx", bytes: blankXlsx },
  pptx: { extension: ".pptx", bytes: blankPptx },
} as const;

const withExtension = (name: string, extension: string) =>
  name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`;

const NO_SUCH_VERSION = "Diese Version der Datei gibt es auf diesem Computer nicht mehr.";
const UNAVAILABLE = "Das gibt es nur auf einem Schreibzeug-Server, nicht für Dateien auf diesem Computer.";

/**
 * The part of the server's API (apps/server src/files/routes.ts) the app needs for files on this
 * computer, in the same shapes. What only makes sense with accounts (sharing, links, versions to go
 * back to, a trash of our own) answers as empty or not there; the app hides it (`/api/info`).
 */
export const createLocalApp = ({
  folder,
  rootName,
  user,
  token,
  media,
  maxUploadBytes,
  collab,
  log = console.error,
}: LocalDeps) => {
  const sessionBases = createSessionBases((fileId) => {
    const session = collab?.hub.session(fileId);
    return session && { baseVersion: session.baseVersion, changes: session.changes.length };
  });
  const limit = bodyLimit({
    maxSize: maxUploadBytes,
    onError: (c) => c.json({ error: { kind: "too_large" as const, message: "Die Datei ist zu groß." } }, 413),
  });
  const sessionUser = { ...user, email: "" };
  const asUser = createMiddleware<AuthEnv>(async (c, next) => {
    c.set("user", sessionUser);
    await next();
  });

  return (
    new Hono<AuthEnv>()
      .basePath("/api")
      .get("/health", (c) => c.json({ ok: true }))
      .get("/local/unlock", unlock(token))
      .use(requireToken(token))
      .use(asUser)
      .get("/info", (c) => c.json({ mode: "local", rootName } satisfies ServerInfo))
      // Better Auth's session reply (better-auth api/routes/session.ts getSession), for the app's
      // account client; there is nobody to sign in or out here.
      .get("/auth/get-session", (c) =>
        c.json({ session: { id: "local", userId: user.id }, user: { ...sessionUser, emailVerified: true } }),
      )
      .get("/nodes", validate("query", parentQuery), async (c) => {
        const { parent } = c.req.valid("query");
        return respond(c, await folder.listing(parent === "root" ? null : parent));
      })
      .get("/nodes/:id", validate("param", idParam), async (c) => {
        const found = await folder.find(c.req.valid("param").id);
        if (!found.ok) return respond(c, found);
        const { path: _, ...node } = found.value;
        return c.json(node);
      })
      .patch("/nodes/:id", validate("param", idParam), validate("json", updateNodeSchema), async (c) => {
        const { name, parentId } = c.req.valid("json");
        const update = {
          ...(name === undefined ? {} : { name }),
          ...(parentId === undefined ? {} : { parentId }),
        };
        return respond(c, await folder.update(c.req.valid("param").id, update));
      })
      .post("/nodes/:id/trash", validate("param", idParam), async (c) =>
        respond(c, await folder.trash(c.req.valid("param").id)),
      )
      .get("/trash", (c) => c.json([]))
      .get("/shared", (c) => c.json([]))
      .get("/recent", async (c) => c.json(await folder.recent()))
      .post("/folders", validate("json", createFolderSchema), async (c) => {
        const { parentId, name } = c.req.valid("json");
        return respond(c, await folder.createFolder(parentId, name), 201);
      })
      .post("/files", limit, validate("form", uploadForm), async (c) => {
        const { parentId, file } = c.req.valid("form");
        const name = nodeNameSchema.safeParse(file.name);
        if (!name.success)
          return respond(c, fail("invalid", name.error.issues[0]?.message ?? "Ungültiger Name."));
        const bytes = new Uint8Array(await file.arrayBuffer());
        return respond(c, await folder.createFile(parentId ?? null, name.data, bytes), 201);
      })
      .post("/files/blank", validate("json", createBlankFileSchema), async (c) => {
        const { parentId, name, format } = c.req.valid("json");
        const blank = BLANK_FILES[format];
        // The name is checked again with its extension: a name of 255 characters must not grow past it.
        const fullName = nodeNameSchema.safeParse(withExtension(name, blank.extension));
        if (!fullName.success)
          return respond(c, fail("invalid", fullName.error.issues[0]?.message ?? "Ungültiger Name."));
        return respond(c, await folder.createFile(parentId, fullName.data, blank.bytes()), 201);
      })
      // The file as it is on disk now, or the version an editing session started at (sessionBases).
      .get("/files/:id/content", validate("param", idParam), validate("query", versionQuery), async (c) => {
        const { id } = c.req.valid("param");
        const read = await folder.read(id);
        if (!read.ok) return respond(c, read);
        const { node } = read.value;
        const bytes = sessionBases.bytesOf(id, c.req.valid("query").version, node.version, read.value.bytes);
        if (!bytes) return respond(c, fail("not_found", NO_SUCH_VERSION));
        return c.body(bytes as Uint8Array<ArrayBuffer>, 200, {
          "content-type": node.mime ?? "application/octet-stream",
          "content-disposition": contentDisposition(node.name),
          "x-schreibzeug-version": String(node.version),
          "cache-control": "no-store",
        });
      })
      .put("/files/:id/content", limit, validate("param", idParam), async (c) => {
        const bytes = new Uint8Array(await c.req.arrayBuffer());
        const { id } = c.req.valid("param");
        const sessionSave = sessionSaveOf(c.req.header(SESSION_SAVE_HEADER));
        const relay = sessionSave ? collab?.hub : undefined;
        if (sessionSave && relay && !relay.begin(id, sessionSave))
          return respond(c, fail("conflict", SESSION_GONE));
        // Until the save is stored or abandoned, its session does not end (hub.ts `begin`).
        const written = await folder.write(id, bytes).catch((error: unknown) => {
          if (sessionSave) relay?.abandon(id);
          throw error;
        });
        const version = written.ok ? written.value.version : null;
        if (sessionSave && version !== null) relay?.stored(id, version, sessionSave);
        else if (sessionSave) relay?.abandon(id);
        return respond(c, written);
      })
      .post("/files/:id/copy", validate("param", idParam), async (c) =>
        respond(c, await folder.copy(c.req.valid("param").id), 201),
      )
      .get("/files/:id/versions", validate("param", idParam), (c) => c.json([]))
      .post("/files/:id/media", limit, validate("param", idParam), async (c) => {
        const file = await folder.findFile(c.req.valid("param").id);
        if (!file.ok) return respond(c, file);
        const bytes = new Uint8Array(await c.req.arrayBuffer());
        const type = imageTypeOf(bytes);
        if (!type) return respond(c, fail("invalid", "Das ist kein Bild im Format PNG, JPEG, GIF oder BMP."));
        return c.json({ name: mediaNameOf(await media.put(bytes), type) }, 201);
      })
      .get("/files/:id/media/:name", validate("param", mediaParam), async (c) => {
        const parsed = parseMediaName(c.req.valid("param").name);
        const bytes = parsed && (await media.get(parsed.sha256).catch(() => null));
        if (!parsed || !bytes) return respond(c, fail("not_found", "Dieses Bild gibt es nicht."));
        return c.body(bytes as Uint8Array<ArrayBuffer>, 200, {
          "content-type": parsed.type.mime,
          "cache-control": "private, max-age=31536000, immutable",
        });
      })
      .route("/", collab ? collabRoutes(collab) : new Hono<AuthEnv>())
      .all("*", (c) => respond(c, fail("not_found", UNAVAILABLE)))
      .onError((error, c) => {
        log("[local]", error);
        return c.json({ error: { kind: "internal" as const, message: "Interner Fehler." } }, 500);
      })
  );
};
