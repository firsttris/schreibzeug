import { z } from "zod";

const MEGABYTE = 1024 * 1024;

const flag = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((value) => value === "true" || value === "1");

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
});

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
};

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
  };
  return { ok: true as const, value: config };
};
