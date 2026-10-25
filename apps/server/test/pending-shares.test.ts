import { nodeSchema, sharedNodeSchema, shareSchema } from "@schreibzeug/files-api";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createBearer } from "../src/auth/bearer";
import { startServer, type TestServer } from "./harness";

const ISSUER = "https://kontext.example.org/api/auth";
const AUDIENCE = "https://dokumente.example.org";

let server: TestServer;
let tokenFor: (sub: string, email: string) => Promise<string>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "EdDSA" }] });
  tokenFor = (sub, email) =>
    new SignJWT({ sub, email, name: email })
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime("5m")
      .sign(privateKey);
  server = await startServer({
    pendingShares: true,
    bearer: (db) => createBearer({ db, issuer: ISSUER, audience: AUDIENCE, providerId: "oidc", keys }),
  });
});
afterAll(() => server?.stop());

const call = (path: string, headers: Record<string, string>, init: RequestInit = {}) =>
  server.app.request(path, { ...init, headers: { ...headers, ...init.headers } });
const asCookie = (cookie: string) => ({ cookie });
const asBearer = (token: string) => ({ authorization: `Bearer ${token}` });
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const documentOf = async (cookie: string, name: string) =>
  nodeSchema.parse(
    await (
      await call("/api/files/blank", asCookie(cookie), json("POST", { name, parentId: null, format: "docx" }))
    ).json(),
  );

const sharesOf = async (cookie: string, id: string) =>
  z.array(shareSchema).parse(await (await call(`/api/nodes/${id}/shares`, asCookie(cookie))).json());

const sharedWith = async (headers: Record<string, string>) =>
  z.array(sharedNodeSchema).parse(await (await call("/api/shared", headers)).json());

describe("shares with an address that has no account yet", () => {
  it("wait, and hold once the person comes through Kontext", async () => {
    const owner = await server.signUp("Pia", "pia@example.org");
    const file = await documentOf(owner, "Tagesordnung");
    const reply = await call(
      `/api/nodes/${file.id}/shares`,
      asCookie(owner),
      json("PUT", { email: "Neu@Example.org", role: "view" }),
    );
    expect(reply.status).toBe(200);
    expect(await sharesOf(owner, file.id)).toEqual([
      {
        userId: "pending:neu@example.org",
        name: "neu@example.org",
        email: "neu@example.org",
        role: "view",
        pending: true,
      },
    ]);

    const token = await tokenFor("kontext-neu", "neu@example.org");
    expect((await sharedWith(asBearer(token))).map((node) => node.id)).toEqual([file.id]);
    expect(await sharesOf(owner, file.id)).toMatchObject([{ email: "neu@example.org", role: "view" }]);
    expect((await sharesOf(owner, file.id))[0]?.pending).toBeUndefined();
  });

  it("never go to a sign-up with a password", async () => {
    const owner = await server.signUp("Ole", "ole@example.org");
    const file = await documentOf(owner, "Vertrag");
    await call(
      `/api/nodes/${file.id}/shares`,
      asCookie(owner),
      json("PUT", { email: "chef@example.org", role: "edit" }),
    );
    const squatter = await server.signUp("Chef", "chef@example.org");
    expect(await sharedWith(asCookie(squatter))).toEqual([]);
  });

  it("wait while the address has an account with a password, and hold once it is connected", async () => {
    const owner = await server.signUp("Ida", "ida@example.org");
    const file = await documentOf(owner, "Angebot");
    await call(
      `/api/nodes/${file.id}/shares`,
      asCookie(owner),
      json("PUT", { email: "bob@example.org", role: "edit" }),
    );
    const bob = await server.signUp("Bob", "bob@example.org");
    // Kontext cannot vouch for an address someone registered with a password: its token is refused.
    expect(
      (await call("/api/shared", asBearer(await tokenFor("kontext-bob", "bob@example.org")))).status,
    ).toBe(401);
    expect(await sharesOf(owner, file.id)).toMatchObject([{ email: "bob@example.org", pending: true }]);
    // Bob connects his account with Kontext from his own session (Better Auth links it).
    const context = await server.auth.$context;
    const session = await server.auth.api.getSession({ headers: new Headers({ cookie: bob }) });
    await context.internalAdapter.linkAccount({
      providerId: "oidc",
      accountId: "kontext-bob",
      userId: session!.user.id,
    });
    expect((await sharedWith(asCookie(bob))).map((node) => node.id)).toEqual([file.id]);
    expect(
      (await sharedWith(asBearer(await tokenFor("kontext-bob", "bob@example.org")))).map((node) => node.id),
    ).toEqual([file.id]);
  });

  it("can be taken back", async () => {
    const owner = await server.signUp("Uta", "uta@example.org");
    const file = await documentOf(owner, "Notiz");
    await call(
      `/api/nodes/${file.id}/shares`,
      asCookie(owner),
      json("PUT", { email: "weg@example.org", role: "view" }),
    );
    const removed = await call(
      `/api/nodes/${file.id}/shares/${encodeURIComponent("pending:weg@example.org")}`,
      asCookie(owner),
      { method: "DELETE" },
    );
    expect(await removed.json()).toEqual([]);
  });
});
