/**
 * A stand-in for Kontext in the E2E run, as far as Schreibzeug sees it: an OpenID Connect provider
 * (discovery, authorize with PKCE and `prompt=none`, token, userinfo, keys) and a page that shows
 * Schreibzeug in a frame and keeps the messages it gets (`/host`). Who is signed in at "Kontext"
 * is a cookie set by its sign-in form. Started by playwright.config.ts.
 *
 * E2E_KONTEXT_PORT: set by playwright.config.ts.
 */
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { E2E_EMBEDDED_URL, E2E_KONTEXT_URL, E2E_OIDC_CLIENT, kontextNameOf } from "./kontext";

const issuer = E2E_KONTEXT_URL;
const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: "e2e", alg: "EdDSA", use: "sig" }] };

type Grant = { email: string; nonce: string | null; challenge: string; redirectUri: string };
const codes = new Map<string, Grant>();
const accessTokens = new Map<string, string>();

const SESSION = "fake_kontext";
const personOf = (email: string) => ({
  sub: `kontext-${email}`,
  email,
  email_verified: true,
  name: kontextNameOf(email),
});

const sessionOf = (request: Request): string | null => {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie.match(new RegExp(`${SESSION}=([^;]+)`))?.[1];
  return value ? decodeURIComponent(value) : null;
};

const html = (body: string) =>
  new Response(`<!doctype html><meta charset="utf-8"><title>Kontext</title>${body}`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });

const redirect = (to: string, headers: Record<string, string> = {}) =>
  new Response(null, { status: 302, headers: { location: to, ...headers } });

const sha256Url = async (value: string) =>
  Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))).toString("base64url");

const authorize = (url: URL, request: Request) => {
  const query = url.searchParams;
  const redirectUri = query.get("redirect_uri") ?? "";
  const back = new URL(redirectUri);
  const state = query.get("state");
  if (state) back.searchParams.set("state", state);
  const email = sessionOf(request);
  if (!email) {
    if (query.get("prompt") === "none") {
      back.searchParams.set("error", "login_required");
      return redirect(back.toString());
    }
    return redirect(`/login?return=${encodeURIComponent(url.pathname + url.search)}`);
  }
  const code = crypto.randomUUID();
  codes.set(code, {
    email,
    nonce: query.get("nonce"),
    challenge: query.get("code_challenge") ?? "",
    redirectUri,
  });
  back.searchParams.set("code", code);
  back.searchParams.set("iss", issuer);
  return redirect(back.toString());
};

const token = async (request: Request) => {
  const form = new URLSearchParams(await request.text());
  const basic = request.headers.get("authorization")?.replace(/^Basic /, "") ?? "";
  const [id, secret] = Buffer.from(basic, "base64").toString().split(":").map(decodeURIComponent);
  const grant = codes.get(form.get("code") ?? "");
  codes.delete(form.get("code") ?? "");
  const valid =
    id === E2E_OIDC_CLIENT.id &&
    secret === E2E_OIDC_CLIENT.secret &&
    grant &&
    grant.redirectUri === form.get("redirect_uri") &&
    grant.challenge === (await sha256Url(form.get("code_verifier") ?? ""));
  if (!valid) return Response.json({ error: "invalid_grant" }, { status: 400 });
  const person = personOf(grant.email);
  const accessToken = crypto.randomUUID();
  accessTokens.set(accessToken, grant.email);
  const idToken = await new SignJWT({ ...person, ...(grant.nonce ? { nonce: grant.nonce } : {}) })
    .setProtectedHeader({ alg: "EdDSA", kid: "e2e" })
    .setIssuer(issuer)
    .setAudience(E2E_OIDC_CLIENT.id)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(privateKey);
  return Response.json({
    access_token: accessToken,
    id_token: idToken,
    token_type: "Bearer",
    expires_in: 600,
  });
};

/** Kontext's side of the frame: the messages it got, and functions the tests call to send some. */
const hostPage = (path: string) =>
  html(`
<style>body{margin:0}iframe{border:0;width:100vw;height:100vh;display:block}</style>
<iframe id="documents" title="Dokumente" src="${E2E_EMBEDDED_URL}${path}?embedded=kontext"></iframe>
<script>
  const origin = ${JSON.stringify(new URL(E2E_EMBEDDED_URL).origin)};
  const frame = document.getElementById("documents");
  window.received = [];
  addEventListener("message", (event) => {
    if (event.origin === origin && event.source === frame.contentWindow) window.received.push(event.data);
  });
  window.tell = (message) => frame.contentWindow.postMessage({ source: "kontext", ...message }, origin);
</script>`);

const loginPage = (back: string) =>
  html(`
<form method="post" action="/login">
  <input type="hidden" name="return" value="${back.replaceAll('"', "&quot;")}">
  <label>E-Mail bei Kontext <input name="email" type="email" required></label>
  <button>Bei Kontext anmelden</button>
</form>`);

const server = Bun.serve({
  port: Number(process.env.E2E_KONTEXT_PORT ?? 3300),
  fetch: async (request) => {
    const url = new URL(request.url);
    switch (`${request.method} ${url.pathname}`) {
      case "GET /health":
        return new Response("ok");
      case "GET /.well-known/openid-configuration":
        return Response.json({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          userinfo_endpoint: `${issuer}/userinfo`,
          jwks_uri: `${issuer}/jwks`,
          response_types_supported: ["code"],
          id_token_signing_alg_values_supported: ["EdDSA"],
          code_challenge_methods_supported: ["S256"],
        });
      case "GET /jwks":
        return Response.json(jwks);
      case "GET /authorize":
        return authorize(url, request);
      case "POST /token":
        return token(request);
      case "GET /userinfo": {
        const email = accessTokens.get(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
        return email ? Response.json(personOf(email)) : new Response(null, { status: 401 });
      }
      case "GET /login":
        return loginPage(url.searchParams.get("return") ?? "/");
      case "POST /login": {
        const form = await request.formData();
        const back = String(form.get("return") ?? "/");
        const cookie = `${SESSION}=${encodeURIComponent(String(form.get("email")))}; Path=/; SameSite=Lax`;
        return redirect(back.startsWith("/") ? back : "/", { "set-cookie": cookie });
      }
      case "GET /host":
        return hostPage(url.searchParams.get("path") ?? "/");
      default:
        return new Response("Not found", { status: 404 });
    }
  },
});
console.log(`Fake Kontext on ${server.url}`);
