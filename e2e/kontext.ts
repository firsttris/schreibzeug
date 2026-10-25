/**
 * Schreibzeug inside Kontext for the E2E run: a stand-in for Kontext (fake-kontext.ts: its sign-in
 * provider and a page that shows Schreibzeug in a frame) and a Schreibzeug server that signs in
 * through it, with a web app in front, all on ports of their own (kontext.spec.ts).
 */
export const E2E_KONTEXT_PORT = 3300;
export const E2E_KONTEXT_URL = `http://localhost:${E2E_KONTEXT_PORT}`;

/** The Schreibzeug server configured for Kontext, and its web app. */
export const E2E_EMBEDDED_PORT = 3400;
export const E2E_EMBEDDED_WEB_PORT = 5176;
export const E2E_EMBEDDED_URL = `http://localhost:${E2E_EMBEDDED_WEB_PORT}`;

export const E2E_OIDC_CLIENT = { id: "schreibzeug", secret: "e2e-secret-of-schreibzeug-at-kontext" };

/** The name "Kontext" gives a person: the part of the address before the @, capitalised. */
export const kontextNameOf = (email: string) => {
  const local = email.slice(0, email.indexOf("@"));
  return local.charAt(0).toUpperCase() + local.slice(1);
};
