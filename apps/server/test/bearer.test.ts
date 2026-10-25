import { folderListingSchema, nodeSchema } from "@schreibzeug/files-api";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBearer } from "../src/auth/bearer";
import { startServer, type TestServer } from "./harness";

const ISSUER = "https://kontext.example.org/api/auth";
const AUDIENCE = "https://dokumente.example.org";

let server: TestServer;
let sign: (
  claims: Record<string, unknown>,
  options?: { audience?: string; issuer?: string },
) => Promise<string>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "EdDSA" }] });
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

describe("tokens from the sign-in provider", () => {
  it("count as the person they name, found by address and kept by subject", async () => {
    const cookie = await server.signUp("Jonas", "jonas@example.org");
    await createFolder(cookie, "Angebote");
    const token = await sign({ sub: "kontext-jonas", email: "Jonas@example.org", name: "Jonas Weber" });
    const listing = folderListingSchema.parse(await (await asBearer(token, "/api/nodes")).json());
    expect(listing.children.map((node) => node.name)).toEqual(["Angebote"]);
    // The subject now names the account, also with another address in the token.
    const later = await sign({ sub: "kontext-jonas", email: "jonas.weber@example.org" });
    const again = folderListingSchema.parse(await (await asBearer(later, "/api/nodes")).json());
    expect(again.children.map((node) => node.name)).toEqual(["Angebote"]);
  });

  it("give someone new an account of their own", async () => {
    const token = await sign({ sub: "kontext-sandra", email: "sandra@example.org", name: "Sandra" });
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3])], "Rechnung.pdf", { type: "application/pdf" }));
    const reply = await asBearer(token, "/api/files", { method: "POST", body: form });
    expect(reply.status).toBe(201);
    const listing = folderListingSchema.parse(await (await asBearer(token, "/api/nodes")).json());
    expect(listing.children.map((node) => node.name)).toEqual(["Rechnung.pdf"]);
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
