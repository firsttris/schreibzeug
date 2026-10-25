import { accessTokenSchema, createdAccessTokenSchema, folderListingSchema } from "@schreibzeug/files-api";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createToken, hashToken } from "../src/auth/tokens";
import { accessTokens, user } from "../src/db/schema";
import { startServer, type TestServer } from "./harness";

let server: TestServer;
let anna: string;
beforeAll(async () => {
  server = await startServer();
  anna = await server.signUp("Anna");
});
afterAll(() => server?.stop());

const withCookie = (cookie: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { cookie, "content-type": "application/json", ...init.headers },
});
const withToken = (token: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
});

const makeToken = async (cookie: string, body: Record<string, unknown>) => {
  const reply = await server.app.request(
    "/api/tokens",
    withCookie(cookie, { method: "POST", body: JSON.stringify(body) }),
  );
  expect(reply.status, await reply.clone().text()).toBe(201);
  return createdAccessTokenSchema.parse(await reply.json());
};

const newFolder = (init: RequestInit) =>
  server.app.request("/api/folders", {
    ...init,
    method: "POST",
    body: JSON.stringify({ name: crypto.randomUUID(), parentId: null }),
  });

describe("personal access tokens", () => {
  it("are shown once and kept only as a hash", async () => {
    const created = await makeToken(anna, { name: "Claude Code", scope: "write" });
    expect(created.token).toMatch(/^sz_[\w-]{43}$/);
    const row = server.db.select().from(accessTokens).where(eq(accessTokens.id, created.id)).get();
    expect(row?.hash).toBe(hashToken(created.token));
    expect(JSON.stringify(row)).not.toContain(created.token);

    const list = accessTokenSchema
      .array()
      .parse(await (await server.app.request("/api/tokens", withCookie(anna))).json());
    expect(list.find((token) => token.id === created.id)).toMatchObject({
      name: "Claude Code",
      scope: "write",
    });
    expect(JSON.stringify(list)).not.toContain(created.token);
  });

  it("act for their user, and note when they were used", async () => {
    const { token, id } = await makeToken(anna, { name: "Lesen und schreiben", scope: "write" });
    expect((await newFolder(withToken(token))).status).toBe(201);
    const listing = folderListingSchema.parse(
      await (await server.app.request("/api/nodes", withToken(token))).json(),
    );
    expect(listing.children.length).toBeGreaterThan(0);
    const row = server.db.select().from(accessTokens).where(eq(accessTokens.id, id)).get();
    expect(row?.lastUsedAt).not.toBeNull();
  });

  it("with the scope read, only read", async () => {
    const { token } = await makeToken(anna, { name: "Nur lesen", scope: "read" });
    expect((await server.app.request("/api/nodes", withToken(token))).status).toBe(200);
    const write = await newFolder(withToken(token));
    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ error: { kind: "forbidden" } });
  });

  it("stop working when revoked or expired, and a wrong one is refused", async () => {
    const { token, id } = await makeToken(anna, { name: "Bald weg", scope: "write" });
    const revoke = await server.app.request(`/api/tokens/${id}`, withCookie(anna, { method: "DELETE" }));
    expect(revoke.status).toBe(200);
    expect((await server.app.request("/api/nodes", withToken(token))).status).toBe(401);

    const annaId = server.db.select({ id: user.id }).from(user).where(eq(user.name, "Anna")).get()?.id ?? "";
    const old = createToken(
      server.db,
      annaId,
      { name: "Alt", scope: "write", days: 30 },
      Date.now() - 31 * 86_400_000,
    );
    expect((await server.app.request("/api/nodes", withToken(old.token))).status).toBe(401);

    const wrong = await server.app.request("/api/nodes", withToken("sz_falsch"));
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get("www-authenticate")).toContain("Bearer");
    // A wrong token is not taken as a request without one, even with a valid session alongside.
    expect(
      (await server.app.request("/api/nodes", withToken("sz_falsch", { headers: { cookie: anna } }))).status,
    ).toBe(401);
  });

  it("cannot manage tokens or join a live session", async () => {
    const { token } = await makeToken(anna, { name: "Kein Verwalter", scope: "write" });
    expect((await server.app.request("/api/tokens", withToken(token))).status).toBe(403);
    expect(
      (
        await server.app.request(
          "/api/tokens",
          withToken(token, { method: "POST", body: JSON.stringify({ name: "x", scope: "write" }) }),
        )
      ).status,
    ).toBe(403);
  });

  it("belong to their user: someone else cannot revoke one", async () => {
    const ben = await server.signUp("Ben");
    const { id, token } = await makeToken(anna, { name: "Annas", scope: "write" });
    expect(
      (await server.app.request(`/api/tokens/${id}`, withCookie(ben, { method: "DELETE" }))).status,
    ).toBe(404);
    expect((await server.app.request("/api/nodes", withToken(token))).status).toBe(200);
  });

  it("checks the name and the scope", async () => {
    const reply = await server.app.request(
      "/api/tokens",
      withCookie(anna, { method: "POST", body: JSON.stringify({ name: " ", scope: "all" }) }),
    );
    expect(reply.status).toBe(400);
  });
});
