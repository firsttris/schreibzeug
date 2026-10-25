import { folderListingSchema, nodeSchema } from "@schreibzeug/files-api";
import { eq } from "drizzle-orm";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBearer } from "../src/auth/bearer";
import { nodes, user } from "../src/db/schema";
import { startServer, type TestServer } from "./harness";

const ISSUER = "https://kontext.example.org/api/auth";
const AUDIENCE = "https://dokumente.example.org";

let server: TestServer;
let keys: ReturnType<typeof createLocalJWKSet>;
let sign: (
  claims: Record<string, unknown>,
  options?: { audience?: string; issuer?: string },
) => Promise<string>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "EdDSA" }] });
  sign = (claims, { audience = AUDIENCE, issuer = ISSUER } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime("5m")
      .sign(privateKey);
  server = await startServer({
    bearer: (db) => createBearer({ db, issuer: ISSUER, audience: AUDIENCE, providerId: "oidc", keys }),
  });
});
afterAll(() => server?.stop());

const asBearer = (token: string, path: string, init: RequestInit = {}) =>
  server.app.request(path, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } });

const createFolder = async (cookie: string, name: string) =>
  nodeSchema.parse(
    await (
      await server.app.request("/api/folders", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name, parentId: null }),
      })
    ).json(),
  );

const namesAt = async (token: string) =>
  folderListingSchema
    .parse(await (await asBearer(token, "/api/nodes")).json())
    .children.map((node) => node.name);

describe("tokens from the sign-in provider", () => {
  it("count as the person they name, kept by subject", async () => {
    const token = await sign({ sub: "kontext-jonas", email: "Jonas@example.org", name: "Jonas Weber" });
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1])], "Angebot.docx"));
    expect((await asBearer(token, "/api/files", { method: "POST", body: form })).status).toBe(201);
    // The subject names the account, also with another address in the token.
    const later = await sign({ sub: "kontext-jonas", email: "jonas.weber@example.org" });
    expect(await namesAt(later)).toEqual(["Angebot.docx"]);
  });

  it("find an account by its confirmed address", async () => {
    const cookie = await server.signUp("Lena", "lena@example.org");
    await createFolder(cookie, "Angebote");
    server.db.update(user).set({ emailVerified: true }).where(eq(user.email, "lena@example.org")).run();
    expect(await namesAt(await sign({ sub: "kontext-lena", email: "lena@example.org" }))).toEqual([
      "Angebote",
    ]);
  });

  it("never hand a colleague's identity to an account someone registered with a password", async () => {
    // Mallory registers the colleague's address with a password (open sign-up or a link).
    const mallory = await server.signUp("Mallory", "opfer@example.org");
    const token = await sign({ sub: "kontext-opfer", email: "opfer@example.org" });
    expect((await asBearer(token, "/api/nodes")).status).toBe(401);
    const listing = folderListingSchema.parse(
      await (await server.app.request("/api/nodes", { headers: { cookie: mallory } })).json(),
    );
    expect(listing.children).toEqual([]);
  });

  it("do not hand an account on to another subject with the same address", async () => {
    const first = await sign({ sub: "kontext-anna-1", email: "anna@example.org" });
    expect(await namesAt(first)).toEqual([]);
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1])], "Annas Notiz.txt"));
    await asBearer(first, "/api/files", { method: "POST", body: form });
    // anna@ is given to someone new at Kontext.
    const second = await sign({ sub: "kontext-anna-2", email: "anna@example.org" });
    expect((await asBearer(second, "/api/nodes")).status).toBe(401);
  });

  it("give someone new an account of their own", async () => {
    const token = await sign({ sub: "kontext-sandra", email: "sandra@example.org", name: "Sandra" });
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3])], "Rechnung.pdf", { type: "application/pdf" }));
    const reply = await asBearer(token, "/api/files", { method: "POST", body: form });
    expect(reply.status).toBe(201);
    expect(await namesAt(token)).toEqual(["Rechnung.pdf"]);
  });

  it("are refused for another audience or issuer, without a subject, and as id tokens", async () => {
    const claims = { sub: "kontext-jonas", email: "jonas@example.org" };
    for (const token of [
      await sign(claims, { audience: "schreibzeug" }),
      await sign(claims, { issuer: "https://evil.example.org" }),
      await sign({ email: "jonas@example.org" }),
      "not-a-token",
    ]) {
      expect((await asBearer(token, "/api/nodes")).status).toBe(401);
    }
  });
});

describe("the sign-in through the provider", () => {
  it("links one subject per account: an address given to someone new does not take it over", async () => {
    const cookie = await server.signUp("Max", "max@example.org");
    const context = await server.auth.$context;
    const session = await server.auth.api.getSession({ headers: new Headers({ cookie }) });
    const userId = session!.user.id;
    expect(
      await context.internalAdapter.linkAccount({ providerId: "oidc", accountId: "kontext-max-1", userId }),
    ).toBeTruthy();
    // Linking it marks the address as confirmed (Better Auth links only the same address).
    expect(server.db.select().from(user).where(eq(user.id, userId)).get()?.emailVerified).toBe(true);
    expect(
      await context.internalAdapter.linkAccount({ providerId: "oidc", accountId: "kontext-max-2", userId }),
    ).toBeNull();
    expect(
      (await asBearer(await sign({ sub: "kontext-max-2", email: "max@example.org" }), "/api/nodes")).status,
    ).toBe(401);
  });
});

describe("ending someone's sessions (DELETE /api/sessions)", () => {
  it("signs the person out everywhere, for the provider's token only", async () => {
    const token = await sign({ sub: "kontext-uwe", email: "uwe@example.org" });
    expect((await asBearer(token, "/api/nodes")).status).toBe(200);
    // Uwe signs in through the provider in his browser: a session of his account.
    const uwe = server.db.select().from(user).where(eq(user.email, "uwe@example.org")).get()!;
    const context = await server.auth.$context;
    const { token: cookieToken } = await context.internalAdapter.createSession(uwe.id);
    expect(await context.internalAdapter.findSession(cookieToken)).not.toBeNull();

    expect((await server.app.request("/api/sessions", { method: "DELETE" })).status).toBe(401);
    expect((await asBearer("not-a-token", "/api/sessions", { method: "DELETE" })).status).toBe(401);
    expect((await asBearer(token, "/api/sessions", { method: "DELETE" })).status).toBe(204);
    expect(await context.internalAdapter.findSession(cookieToken)).toBeNull();
    // Someone who never came here gets no account from it.
    const stranger = await sign({ sub: "kontext-fremd", email: "fremd@example.org" });
    expect((await asBearer(stranger, "/api/sessions", { method: "DELETE" })).status).toBe(204);
    expect(server.db.select().from(user).where(eq(user.email, "fremd@example.org")).get()).toBeUndefined();
  });
});

describe("the first account", () => {
  it("takes over the files from before accounts also when a token makes it", async () => {
    const fresh = await startServer({
      bearer: (db) => createBearer({ db, issuer: ISSUER, audience: AUDIENCE, providerId: "oidc", keys }),
    });
    try {
      fresh.db
        .insert(nodes)
        .values({ id: crypto.randomUUID(), kind: "folder", name: "Altbestand", nameKey: "altbestand" })
        .run();
      const token = await sign({ sub: "kontext-erste", email: "erste@example.org" });
      const reply = await fresh.app.request("/api/nodes", { headers: { authorization: `Bearer ${token}` } });
      expect(folderListingSchema.parse(await reply.json()).children.map((node) => node.name)).toEqual([
        "Altbestand",
      ]);
    } finally {
      fresh.stop();
    }
  });
});

describe("tokens from the sign-in provider beside personal access tokens", () => {
  it("are told apart by the prefix: sz_ is a personal access token, anything else Kontext's", async () => {
    const cookie = await server.signUp("Pia", "pia@example.org");
    await createFolder(cookie, "Pias Ordner");
    const reply = await server.app.request("/api/tokens", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "Claude Code", scope: "read" }),
    });
    const { token } = (await reply.json()) as { token: string };
    expect(await namesAt(token)).toEqual(["Pias Ordner"]);
    // A read token stays read-only, and a wrong one is refused, not handed to the provider.
    expect((await asBearer(token, "/api/folders", { method: "POST" })).status).toBe(403);
    expect((await asBearer("sz_falsch", "/api/nodes")).status).toBe(401);
    // Kontext's tokens still count as before.
    expect(
      (await asBearer(await sign({ sub: "kontext-pia-2", email: "pia2@example.org" }), "/api/nodes")).status,
    ).toBe(200);
  });
});
