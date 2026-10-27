import { nodeSchema, storageSchema } from "@schreibzeug/files-api";
import { testClient } from "hono/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diskOf } from "../src/disk";
import { MAX_UPLOAD_BYTES, startServer, type TestServer } from "./harness";

let server: TestServer;
let cookie: string;
let api: ReturnType<typeof testClient<TestServer["app"]>>["api"];
beforeAll(async () => {
  server = await startServer();
  cookie = await server.signUp("Berta");
  api = testClient(server.app, {}, undefined, { headers: { cookie } }).api;
});
afterAll(() => server?.stop());

const bytesOf = (size: number) => new Uint8Array(size).fill(65);

const upload = async (name: string, size: number) =>
  nodeSchema.parse(await (await api.files.$post({ form: { file: new File([bytesOf(size)], name) } })).json());

const save = (id: string, size: number) =>
  server.app.request(`/api/files/${id}/content`, { method: "PUT", body: bytesOf(size), headers: { cookie } });

const storageWith = async (headers: { cookie: string }) => {
  const response = await server.app.request("/api/storage", { headers });
  expect(response.status).toBe(200);
  return storageSchema.parse(await response.json());
};

describe("storage", () => {
  it("counts the newest versions, the older ones and the trash apart", async () => {
    const empty = await storageWith({ cookie });
    expect(empty.usage).toEqual({ files: 0, versions: 0, trash: 0 });

    const report = await upload("Bericht.txt", 100);
    await save(report.id, 300);
    const old = await upload("Alt.txt", 50);
    await save(old.id, 70);
    await api.nodes[":id"].trash.$post({ param: { id: old.id } });

    expect((await storageWith({ cookie })).usage).toEqual({ files: 300, versions: 100, trash: 120 });
  });

  it("counts only the user's own files", async () => {
    const other = await server.signUp("Carl");
    expect((await storageWith({ cookie: other })).usage).toEqual({ files: 0, versions: 0, trash: 0 });
  });

  it("names the drive's room and the largest upload", async () => {
    const { disk, uploadLimit } = await storageWith({ cookie });
    expect(uploadLimit).toBe(MAX_UPLOAD_BYTES);
    expect(disk?.total).toBeGreaterThan(0);
    expect(disk?.free).toBeLessThanOrEqual(disk?.total ?? 0);
  });

  it("needs a session", async () => {
    expect((await server.app.request("/api/storage")).status).toBe(401);
  });
});

describe("diskOf", () => {
  it("counts the blocks free for everyone, not those kept for root", () => {
    expect(diskOf({ bsize: 4096, blocks: 1000, bavail: 100 })).toEqual({ free: 409_600, total: 4_096_000 });
  });
});
