import { folderListingSchema, nodeSchema, sharedNodeSchema, shareSchema } from "@stapel/files-api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
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

const createFolder = async (cookie: string, name: string, parentId: string | null = null) =>
  nodeSchema.parse(await (await call("/api/folders", cookie, json("POST", { name, parentId }))).json());

const createDocument = async (cookie: string, name: string, parentId: string | null) =>
  nodeSchema.parse(
    await (await call("/api/files/blank", cookie, json("POST", { name, parentId, format: "docx" }))).json(),
  );

const share = (cookie: string, id: string, email: string, role: "edit" | "view") =>
  call(`/api/nodes/${id}/shares`, cookie, json("PUT", { email, role }));

const listing = async (cookie: string, parent: string) =>
  folderListingSchema.parse(await (await call(`/api/nodes?parent=${parent}`, cookie)).json());

/** Three accounts per test: the owner, someone it is shared with, and someone else. */
const people = async (prefix: string) => ({
  owner: await server.signUp(`${prefix}Owner`),
  guest: await server.signUp(`${prefix}Guest`),
  stranger: await server.signUp(`${prefix}Stranger`),
  guestEmail: `${prefix.toLowerCase()}guest@example.org`,
});

describe("sharing", () => {
  it("shares a folder with everything in it, and lists it for the other person", async () => {
    const { owner, guest, stranger, guestEmail } = await people("A");
    const folder = await createFolder(owner, "Projekt");
    const sub = await createFolder(owner, "Entwürfe", folder.id);
    const file = await createDocument(owner, "Brief", sub.id);

    const reply = await share(owner, folder.id, guestEmail.toUpperCase(), "view");
    expect(reply.status).toBe(200);
    expect(z.array(shareSchema).parse(await reply.json())).toMatchObject([
      { name: "AGuest", email: guestEmail, role: "view" },
    ]);

    const shared = z.array(sharedNodeSchema).parse(await (await call("/api/shared", guest)).json());
    expect(shared).toMatchObject([{ id: folder.id, role: "view", ownerName: "AOwner" }]);

    const inside = await listing(guest, sub.id);
    expect(inside.path.map((node) => node.name)).toEqual(["Projekt", "Entwürfe"]);
    expect(inside.children).toMatchObject([{ id: file.id, role: "view" }]);
    expect((await call(`/api/files/${file.id}/content`, guest)).status).toBe(200);

    expect((await call(`/api/nodes/${file.id}`, stranger)).status).toBe(404);
    expect(await (await call("/api/shared", stranger)).json()).toEqual([]);
  });

  it("lets a viewer look but not change, and an editor change but not delete or move", async () => {
    const { owner, guest, guestEmail } = await people("B");
    const folder = await createFolder(owner, "Team");
    const file = await createDocument(owner, "Plan", folder.id);
    await share(owner, folder.id, guestEmail, "view");

    const save = () =>
      call(`/api/files/${file.id}/content`, guest, { method: "PUT", body: new Uint8Array([1]) });
    expect((await save()).status).toBe(403);
    expect((await call(`/api/nodes/${file.id}`, guest, json("PATCH", { name: "X.docx" }))).status).toBe(403);
    expect(
      (await call("/api/folders", guest, json("POST", { name: "Neu", parentId: folder.id }))).status,
    ).toBe(403);

    await share(owner, folder.id, guestEmail, "edit");
    expect(nodeSchema.parse(await (await save()).json())).toMatchObject({ version: 2, role: "edit" });
    expect((await call(`/api/nodes/${file.id}`, guest, json("PATCH", { name: "Plan 2.docx" }))).status).toBe(
      200,
    );
    expect((await call(`/api/nodes/${file.id}`, guest, json("PATCH", { parentId: null }))).status).toBe(403);
    expect((await call(`/api/nodes/${file.id}/trash`, guest, { method: "POST" })).status).toBe(403);
    expect((await call(`/api/nodes/${folder.id}/shares`, guest)).status).toBe(403);
  });

  it("gives what an editor creates in a shared folder to the folder's owner", async () => {
    const { owner, guest, guestEmail } = await people("C");
    const folder = await createFolder(owner, "Gemeinsam");
    await share(owner, folder.id, guestEmail, "edit");

    const created = await createDocument(guest, "Notiz", folder.id);
    expect(created.role).toBe("edit");
    expect((await listing(owner, folder.id)).children).toMatchObject([{ id: created.id, role: "owner" }]);
    expect((await call(`/api/nodes/${created.id}/trash`, owner, { method: "POST" })).status).toBe(200);
  });

  it("puts a viewer's copy into their own files", async () => {
    const { owner, guest, guestEmail } = await people("G");
    const folder = await createFolder(owner, "Nur lesen");
    const file = await createDocument(owner, "Vorlage", folder.id);
    await share(owner, folder.id, guestEmail, "view");
    const reply = await call(`/api/files/${file.id}/copy`, guest, { method: "POST" });
    expect(reply.status).toBe(201);
    expect(nodeSchema.parse(await reply.json())).toMatchObject({
      name: "Vorlage (Kopie).docx",
      parentId: null,
      role: "owner",
    });
  });

  it("takes a share back", async () => {
    const { owner, guest, guestEmail } = await people("D");
    const file = await createDocument(owner, "Geheim", null);
    await share(owner, file.id, guestEmail, "edit");
    const [entry] = z
      .array(shareSchema)
      .parse(await (await call(`/api/nodes/${file.id}/shares`, owner)).json());
    expect(entry).toBeDefined();

    const reply = await call(`/api/nodes/${file.id}/shares/${entry?.userId}`, owner, { method: "DELETE" });
    expect(await reply.json()).toEqual([]);
    expect((await call(`/api/nodes/${file.id}`, guest)).status).toBe(404);
  });

  it("only shares with people who have an account, and not with the owner", async () => {
    const { owner } = await people("E");
    const file = await createDocument(owner, "Brief", null);
    const unknown = await share(owner, file.id, "niemand@example.org", "view");
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ error: { message: "Kein Konto mit dieser E-Mail." } });
    expect((await share(owner, file.id, "eowner@example.org", "view")).status).toBe(400);
  });

  it("hides a shared node in the trash from the other person", async () => {
    const { owner, guest, guestEmail } = await people("F");
    const file = await createDocument(owner, "Alt", null);
    await share(owner, file.id, guestEmail, "view");
    await call(`/api/nodes/${file.id}/trash`, owner, { method: "POST" });
    expect(await (await call("/api/shared", guest)).json()).toEqual([]);
    expect((await call(`/api/nodes/${file.id}`, guest)).status).toBe(404);
  });
});
