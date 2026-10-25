import { z } from "zod";

const MEGABYTE = 1024 * 1024;

const flag = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((value) => value === "true" || value === "1");

/** An address that may be left empty, without its trailing slash. */
const optionalUrl = z
  .preprocess((value) => value || undefined, z.url().optional())
  .transform((value) => value?.replace(/\/+$/, ""));

const configSchema = z.object({
  SCHREIBZEUG_DATA_DIR: z.string().min(1).default("data"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SCHREIBZEUG_MAX_UPLOAD_MB: z.coerce.number().positive().default(512),
  SCHREIBZEUG_AUTH_SECRET: z
    .string()
    .min(32, "SCHREIBZEUG_AUTH_SECRET needs at least 32 characters.")
    .optional(),
  SCHREIBZEUG_OPEN_SIGNUP: flag,
  SCHREIBZEUG_TRUSTED_ORIGINS: z.string().optional(),
  SCHREIBZEUG_WEB_DIR: z.string().min(1).optional(),
  SCHREIBZEUG_URL: optionalUrl,
  SCHREIBZEUG_EMBED_ORIGIN: optionalUrl,
  OIDC_ISSUER: optionalUrl,
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  OIDC_NAME: z.string().min(1).default("Kontext"),
});

/** Signing in through another service (OpenID Connect), e.g. Kontext. */
export type OidcConfig = {
  /** The provider's issuer; discovery is at `<issuer>/.well-known/openid-configuration`. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** The name on the button: "Anmelden mit <name>". */
  name: string;
};

export type Config = {
  /** The blobs and the SQLite database (schreibzeug.db) live here. */
  dataDir: string;
  port: number;
  maxUploadBytes: number;
  /** Absent: main.ts keeps a generated one in the data folder. */
  authSecret: string | undefined;
  openSignup: boolean;
  trustedOrigins: string[];
  /** The built web app (apps/web/dist) to serve beside the API; absent: the API only. */
  webDir: string | undefined;
  /** Where browsers reach this server; the base of the sign-in callback, the API tokens' audience and the links the MCP tools give. */
  publicUrl: string | undefined;
  /** The one site that may show Schreibzeug in a frame (Kontext), as an origin. */
  embedOrigin: string | undefined;
  /** Absent: email and password only. */
  oidc: OidcConfig | undefined;
};

type ParsedConfig = z.infer<typeof configSchema>;

/** The OIDC settings, when all three that it needs are there. */
const oidcOf = (value: ParsedConfig): OidcConfig | undefined =>
  value.OIDC_ISSUER && value.OIDC_CLIENT_ID && value.OIDC_CLIENT_SECRET
    ? {
        issuer: value.OIDC_ISSUER,
        clientId: value.OIDC_CLIENT_ID,
        clientSecret: value.OIDC_CLIENT_SECRET,
        name: value.OIDC_NAME,
      }
    : undefined;

/** Reads the server's settings from the environment; every one has a default for development. */
export const readConfig = (env: Record<string, string | undefined>) => {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) return { ok: false as const, error: z.prettifyError(parsed.error) };
  const value = parsed.data;
  const config: Config = {
    dataDir: value.SCHREIBZEUG_DATA_DIR,
    port: value.PORT,
    maxUploadBytes: value.SCHREIBZEUG_MAX_UPLOAD_MB * MEGABYTE,
    authSecret: value.SCHREIBZEUG_AUTH_SECRET,
    openSignup: value.SCHREIBZEUG_OPEN_SIGNUP,
    trustedOrigins: (value.SCHREIBZEUG_TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    webDir: value.SCHREIBZEUG_WEB_DIR,
    publicUrl: value.SCHREIBZEUG_URL,
    embedOrigin: value.SCHREIBZEUG_EMBED_ORIGIN && new URL(value.SCHREIBZEUG_EMBED_ORIGIN).origin,
    oidc: oidcOf(value),
  };
  return { ok: true as const, value: config };
};
