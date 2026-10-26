import { folderListingSchema, invitationSchema, inviteSchema, nodeSchema } from "@schreibzeug/files-api";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../src/app";
import { createAuth, INVITE_HEADER } from "../src/auth/auth";
import { createBlobStore } from "../src/blobs";
import { invites } from "../src/db/schema";
import { startServer, type TestServer } from "./harness";

let server: TestServer;
beforeAll(async () => {
  server = await startServer();
});
afterAll(() => server?.stop());

const call = (path: string, cookie: string | null, init: RequestInit = {}) =>
  server.app.request(path, { ...init, headers: { ...(cookie ? { cookie } : {}), ...init.headers } });

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const createFolder = async (cookie: string, name: string) =>
  nodeSchema.parse(await (await call("/api/folders", cookie, json("POST", { name, parentId: null }))).json());

const createInvite = async (cookie: string, id: string, role: "edit" | "view", days = 7) =>
  inviteSchema.parse(
    await (await call(`/api/nodes/${id}/invites`, cookie, json("POST", { role, days }))).json(),
  );

const accept = (cookie: string, token: string) =>
  call(`/api/invites/${token}/accept`, cookie, { method: "POST" });

describe("invitations by link", () => {
  it("shows what a link shares without a session, and shares it with whoever accepts", async () => {
    const owner = await server.signUp("Inge");
    const guest = await server.signUp("Jonas");
    const folder = await createFolder(owner, "Bauprojekt");
    const invite = await createInvite(owner, folder.id, "edit");
    expect(invite.token.length).toBeGreaterThanOrEqual(32);

    const info = await call(`/api/invites/${invite.token}`, null);
    expect(info.status).toBe(200);
    expect(invitationSchema.parse(await info.json())).toMatchObject({
      nodeName: "Bauprojekt",
      kind: "folder",
      ownerName: "Inge",
      role: "edit",
    });

    const accepted = await accept(guest, invite.token);
    expect(nodeSchema.parse(await accepted.json())).toMatchObject({ id: folder.id, role: "edit" });
    expect(
      folderListingSchema.parse(await (await call(`/api/nodes?parent=${folder.id}`, guest)).json()).folder,
    ).toMatchObject({ role: "edit" });
  });

  it("never weakens a share someone already has, and leaves the owner as owner", async () => {
    const owner = await server.signUp("Karl");
    const guest = await server.signUp("Lena");
    const folder = await createFolder(owner, "Fotos");
    await accept(guest, (await createInvite(owner, folder.id, "edit")).token);
    const weaker = await accept(guest, (await createInvite(owner, folder.id, "view")).token);
    expect(nodeSchema.parse(await weaker.json()).role).toBe("edit");
    const own = await accept(owner, (await createInvite(owner, folder.id, "view")).token);
    expect(nodeSchema.parse(await own.json()).role).toBe("owner");
  });

  it("lists and deletes links; only the owner may", async () => {
    const owner = await server.signUp("Mia");
    const other = await server.signUp("Nils");
    const folder = await createFolder(owner, "Verträge");
    const invite = await createInvite(owner, folder.id, "view", 30);
    const list = async () =>
      z.array(inviteSchema).parse(await (await call(`/api/nodes/${folder.id}/invites`, owner)).json());
    expect(await list()).toMatchObject([{ token: invite.token, role: "view" }]);
    expect((await call(`/api/nodes/${folder.id}/invites`, other)).status).toBe(404);

    await call(`/api/nodes/${folder.id}/invites/${invite.token}`, owner, { method: "DELETE" });
    expect(await list()).toEqual([]);
    expect((await call(`/api/invites/${invite.token}`, null)).status).toBe(404);
    expect((await accept(other, invite.token)).status).toBe(404);
  });

  it("refuses a link that has expired or whose node is in the trash", async () => {
    const owner = await server.signUp("Olga");
    const guest = await server.signUp("Paul");
    const folder = await createFolder(owner, "Alt");
    const invite = await createInvite(owner, folder.id, "view", 1);
    server.db
      .update(invites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invites.token, invite.token))
      .run();
    expect((await accept(guest, invite.token)).status).toBe(404);

    const fresh = await createInvite(owner, folder.id, "view");
    await call(`/api/nodes/${folder.id}/trash`, owner, { method: "POST" });
    expect((await call(`/api/invites/${fresh.token}`, null)).status).toBe(404);
  });

  it("only accepts the lengths of time the page offers", async () => {
    const owner = await server.signUp("Quirin");
    const folder = await createFolder(owner, "Kurz");
    const reply = await call(
      `/api/nodes/${folder.id}/invites`,
      owner,
      json("POST", { role: "view", days: 365 }),
    );
    expect(reply.status).toBe(400);
  });
});

describe("sign-up with a link", () => {
  it("opens a closed sign-up for someone who brings a link that holds", async () => {
    const fresh = await startServer();
    try {
      const closed = createAuth({ db: fresh.db, secret: "x".repeat(40), openSignup: false });
      const app = createApp({
        auth: closed,
        db: fresh.db,
        blobs: createBlobStore(fresh.dataDir),
        maxUploadBytes: 1024,
      });
      const signUp = (name: string, token?: string) =>
        app.request("/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json", ...(token ? { [INVITE_HEADER]: token } : {}) },
          body: JSON.stringify({ name, email: `${name}@example.org`, password: "geheim-genug" }),
        });

      const first = await signUp("first");
      const cookie = first.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      const folder = nodeSchema.parse(
        await (
          await app.request("/api/folders", {
            ...json("POST", { name: "Team", parentId: null }),
            headers: { cookie, "content-type": "application/json" },
          })
        ).json(),
      );
      const invite = inviteSchema.parse(
        await (
          await app.request(`/api/nodes/${folder.id}/invites`, {
            ...json("POST", { role: "edit" }),
            headers: { cookie, "content-type": "application/json" },
          })
        ).json(),
      );

      expect((await signUp("uninvited")).status).toBe(403);
      expect((await signUp("forged", "not-a-token")).status).toBe(403);
      const invited = await signUp("invited", invite.token);
      expect(invited.status).toBe(200);
      // The account the link opened is made for it: the link is accepted with the sign-up.
      const invitedCookie = invited.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      const shared = await app.request("/api/shared", { headers: { cookie: invitedCookie } });
      expect(
        z.array(z.object({ id: z.string(), role: z.string() })).parse(await shared.json()),
      ).toMatchObject([{ id: folder.id, role: "edit" }]);
    } finally {
      await fresh.stop();
    }
  });
});
