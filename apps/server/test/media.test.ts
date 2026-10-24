import { mediaSchema, nodeSchema } from "@stapel/files-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { imageTypeOf, parseMediaName } from "../src/files/media";
import { startServer, type TestServer } from "./harness";

let server: TestServer;
beforeAll(async () => {
  server = await startServer();
});
afterAll(() => server?.stop());

const call = (path: string, cookie: string, init: RequestInit = {}) =>
  server.app.request(path, { ...init, headers: { cookie, ...init.headers } });

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** The eight bytes every PNG starts with, and a little after them. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const createDocument = async (cookie: string, name: string) =>
  nodeSchema.parse(
    await (
      await call("/api/files/blank", cookie, json("POST", { name, parentId: null, format: "docx" }))
    ).json(),
  );

const addImage = (cookie: string, id: string, bytes: Uint8Array) =>
  call(`/api/files/${id}/media`, cookie, { method: "POST", body: bytes as Uint8Array<ArrayBuffer> });

describe("images of a document", () => {
  it("knows the image formats by their first bytes", () => {
    expect(imageTypeOf(PNG)).toEqual({ extension: "png", mime: "image/png" });
    expect(imageTypeOf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe("image/jpeg");
    expect(imageTypeOf(new TextEncoder().encode("GIF89a"))?.extension).toBe("gif");
    expect(imageTypeOf(new TextEncoder().encode("<svg/>"))).toBeNull();
    expect(parseMediaName(`${"a".repeat(64)}.png`)?.type.mime).toBe("image/png");
    expect(parseMediaName("../secret.png")).toBeNull();
    expect(parseMediaName(`${"a".repeat(64)}.exe`)).toBeNull();
  });

  it("stores an image under its hash and serves it to whoever may see the file", async () => {
    const owner = await server.signUp("MOwner");
    const viewer = await server.signUp("MViewer");
    const stranger = await server.signUp("MStranger");
    const file = await createDocument(owner, "Briefkopf");

    const reply = await addImage(owner, file.id, PNG);
    expect(reply.status).toBe(201);
    const { name } = mediaSchema.parse(await reply.json());
    expect(name).toMatch(/^[0-9a-f]{64}\.png$/);

    const served = await call(`/api/files/${file.id}/media/${name}`, owner);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);

    await call(
      `/api/nodes/${file.id}/shares`,
      owner,
      json("PUT", { email: "mviewer@example.org", role: "view" }),
    );
    expect((await call(`/api/files/${file.id}/media/${name}`, viewer)).status).toBe(200);
    expect((await addImage(viewer, file.id, PNG)).status).toBe(403);

    expect((await call(`/api/files/${file.id}/media/${name}`, stranger)).status).toBe(404);
    expect((await addImage(stranger, file.id, PNG)).status).toBe(404);
  });

  it("refuses what is not an image, and names it did not give out", async () => {
    const owner = await server.signUp("MOther");
    const file = await createDocument(owner, "Notiz");
    const refused = await addImage(owner, file.id, new TextEncoder().encode("<script>"));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({
      error: { message: "Das ist kein Bild im Format PNG, JPEG, GIF oder BMP." },
    });
    expect((await call(`/api/files/${file.id}/media/${"b".repeat(64)}.png`, owner)).status).toBe(404);
  });
});
