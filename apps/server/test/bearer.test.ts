import { folderListingSchema, nodeSchema } from "@schreibzeug/files-api";
import { eq } from "drizzle-orm";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBearer } from "../src/auth/bearer";
import { createToken } from "../src/auth/tokens";
import { nodes, user } from "../src/db/schema";
import { startServer, type TestServer } from "./harness";

const ISSUER = "https://kontext.example.org/api/auth";
const AUDIENCE = "https://dokumente.example.org";
const CLIENT_ID = "schreibzeug";

let server: TestServer;
let keys: ReturnType<typeof createLocalJWKSet>;
let sign: (
  claims: Record<string, unknown>,
  options?: { audience?: string; issuer?: string },
) => Promise<string>;
let privateKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const { publicKey } = pair;
  privateKey = pair.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "EdDSA" }] });
  sign = (claims, { audience = AUDIENCE, issuer = ISSUER } = {}) =>
    new SignJWT({ email_verified: true, ...claims })
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  server = await startServer({
    bearer: (db) =>
      createBearer({ db, issuer: ISSUER, audience: AUDIENCE, clientId: CLIENT_ID, providerId: "oidc", keys }),
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

  it("confirm an address only with email_verified: true", async () => {
    const cookie = await server.signUp("Nora", "nora@example.org");
    await createFolder(cookie, "Noras");
    server.db.update(user).set({ emailVerified: true }).where(eq(user.email, "nora@example.org")).run();
    for (const emailVerified of [false, "true", undefined]) {
      const token = await sign({
        sub: "kontext-nora",
        email: "nora@example.org",
        email_verified: emailVerified,
      });
      expect((await asBearer(token, "/api/nodes")).status).toBe(401);
    }
    // Someone new gets an account, but its address stays unconfirmed.
    const token = await sign({ sub: "kontext-olaf", email: "olaf@example.org", email_verified: false });
    expect((await asBearer(token, "/api/nodes")).status).toBe(200);
    expect(server.db.select().from(user).where(eq(user.email, "olaf@example.org")).get()?.emailVerified).toBe(
      false,
    );
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

  it("are refused when made for another client, without an expiry, or too old", async () => {
    const claims = { sub: "kontext-jonas", email: "jonas@example.org", email_verified: true };
    const unsigned = () =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE);
    for (const token of [
      await sign({ ...claims, azp: "anderer-client" }),
      await sign({ ...claims, client_id: "anderer-client" }),
      await unsigned().setIssuedAt().sign(privateKey),
      await unsigned()
        .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
        .setExpirationTime("1d")
        .sign(privateKey),
    ]) {
      expect((await asBearer(token, "/api/nodes")).status).toBe(401);
    }
    expect((await asBearer(await sign({ ...claims, azp: CLIENT_ID }), "/api/nodes")).status).toBe(200);
  });
});

describe("the sign-in through the provider", () => {
  it("does not confirm an address the provider does not vouch for", async () => {
    const cookie = await server.signUp("Paul", "paul@example.org");
    const context = await server.auth.$context;
    const userId = (await server.auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.id ?? "";
    const idToken = await sign(
      { sub: "kontext-paul", email: "paul@example.org", email_verified: false },
      { audience: "schreibzeug" },
    );
    await context.internalAdapter.linkAccount({
      providerId: "oidc",
      accountId: "kontext-paul",
      userId,
      idToken,
    });
    expect(server.db.select().from(user).where(eq(user.id, userId)).get()?.emailVerified).toBe(false);
  });

  it("links one subject per account: an address given to someone new does not take it over", async () => {
    const cookie = await server.signUp("Max", "max@example.org");
    const context = await server.auth.$context;
    const session = await server.auth.api.getSession({ headers: new Headers({ cookie }) });
    const userId = session!.user.id;
    // The provider's id token, as Better Auth stores it with the account it links.
    const idToken = await sign(
      { sub: "kontext-max-1", email: "max@example.org" },
      { audience: "schreibzeug" },
    );
    expect(
      await context.internalAdapter.linkAccount({
        providerId: "oidc",
        accountId: "kontext-max-1",
        userId,
        idToken,
      }),
    ).toBeTruthy();
    // Linking it marks the address as confirmed when the provider confirms it.
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
      bearer: (db) =>
        createBearer({
          db,
          issuer: ISSUER,
          audience: AUDIENCE,
          clientId: CLIENT_ID,
          providerId: "oidc",
          keys,
        }),
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

describe("tokens from the sign-in provider and what only the person may do", () => {
  it("cannot make, list or revoke personal access tokens", async () => {
    const jwt = await sign({ sub: "kontext-quinn", email: "quinn@example.org", name: "Quinn" });
    const made = await asBearer(jwt, "/api/tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "minted", scope: "write", days: null }),
    });
    expect(made.status).toBe(403);
    expect((await asBearer(jwt, "/api/tokens")).status).toBe(403);
  });

  it("ending someone's sessions ends their personal access tokens too", async () => {
    const jwt = await sign({ sub: "kontext-rosa", email: "rosa@example.org", name: "Rosa" });
    expect((await asBearer(jwt, "/api/nodes")).status).toBe(200);
    const rosa = server.db.select({ id: user.id }).from(user).where(eq(user.email, "rosa@example.org")).get();
    const { token } = createToken(server.db, rosa?.id ?? "", {
      name: "Claude Code",
      scope: "write",
      days: null,
    });
    expect((await asBearer(token, "/api/nodes")).status).toBe(200);
    expect((await asBearer(jwt, "/api/sessions", { method: "DELETE" })).status).toBe(204);
    expect((await asBearer(token, "/api/nodes")).status).toBe(401);
  });
});
