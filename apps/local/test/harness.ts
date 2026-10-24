import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createBlobStore } from "@schreibzeug/server/blobs";
import { ok } from "@schreibzeug/server/result";
import { createLocalApp } from "../src/app";
import { createFolder } from "../src/folder";
import { COOKIE } from "../src/gate";
import { createIds } from "../src/ids";

export const TOKEN = "a-token-for-the-tests-only";

/**
 * The local server over a temporary folder; "deleted" files go to a folder beside it instead of
 * the system's trash, so the tests can see them there.
 */
export const startLocal = async () => {
  const base = await mkdtemp(join(tmpdir(), "schreibzeug-local-test-"));
  const root = join(base, "Dokumente");
  const trashed = join(base, "trash");
  await Promise.all([mkdir(root), mkdir(trashed), mkdir(join(base, "media"))]);
  const folder = createFolder({
    root,
    ids: createIds(),
    trash: async (path) => {
      await rename(path, join(trashed, basename(path)));
      return ok(null);
    },
  });
  const app = createLocalApp({
    folder,
    rootName: "Dokumente",
    user: { id: "local", name: "Tristan" },
    token: TOKEN,
    media: createBlobStore(join(base, "media")),
    maxUploadBytes: 64 * 1024,
    log: () => {},
  });

  const headers = { cookie: `${COOKIE}=${TOKEN}`, origin: "http://localhost" };
  const request = (path: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  const json = (path: string, method: string, body: unknown) =>
    request(path, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

  return {
    app,
    root,
    trashed,
    request,
    json,
    stop: () => rm(base, { recursive: true, force: true }),
  };
};

export type Local = Awaited<ReturnType<typeof startLocal>>;
