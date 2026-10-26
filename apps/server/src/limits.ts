import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";

/**
 * Bun's own limit (main.ts `maxRequestBodySize`) is sized for uploads, and it holds for every route.
 * Better Call reads a JSON body whole before an endpoint looks at who is asking
 * (better-call utils getBody), so the routes that take no file get small limits of their own.
 */

/** Sign-up, sign-in and the rest of Better Auth's routes: names, addresses, passwords. */
export const AUTH_BODY_BYTES = 64 * 1024;

/** Every other route but the uploads: JSON for folders, shares, links, tokens and editor jobs. */
export const DEFAULT_BODY_BYTES = 16 * 1024 * 1024;

const tooLarge = (maxSize: number) =>
  bodyLimit({
    maxSize,
    onError: (c) =>
      c.json({ error: { kind: "too_large" as const, message: "Die Anfrage ist zu groß." } }, 413),
  });

export const authBodyLimit = tooLarge(AUTH_BODY_BYTES);

/** The routes that take a file's bytes; files/routes.ts bounds them by `maxUploadBytes`. */
const UPLOADS: readonly (readonly [method: string, path: RegExp])[] = [
  ["POST", /^\/api\/files$/],
  ["PUT", /^\/api\/files\/[^/]+\/content$/],
  ["POST", /^\/api\/files\/[^/]+\/media$/],
];

const isUpload = (method: string, path: string) =>
  UPLOADS.some(([uploadMethod, pattern]) => uploadMethod === method && pattern.test(path));

const defaultLimit = tooLarge(DEFAULT_BODY_BYTES);

/** The default limit for every route that is not an upload. */
export const defaultBodyLimit = createMiddleware(async (c, next) =>
  isUpload(c.req.method, c.req.path) ? next() : defaultLimit(c, next),
);
