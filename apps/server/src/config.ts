import { z } from "zod";

const MEGABYTE = 1024 * 1024;

const flag = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((value) => value === "true" || value === "1");

const configSchema = z.object({
  STAPEL_DATA_DIR: z.string().min(1).default("data"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  STAPEL_MAX_UPLOAD_MB: z.coerce.number().positive().default(512),
  STAPEL_AUTH_SECRET: z.string().min(32, "STAPEL_AUTH_SECRET needs at least 32 characters.").optional(),
  STAPEL_OPEN_SIGNUP: flag,
  STAPEL_TRUSTED_ORIGINS: z.string().optional(),
});

export type Config = {
  /** The blobs and the SQLite database (stapel.db) live here. */
  dataDir: string;
  port: number;
  maxUploadBytes: number;
  /** Absent: main.ts keeps a generated one in the data folder. */
  authSecret: string | undefined;
  openSignup: boolean;
  trustedOrigins: string[];
};

/** Reads the server's settings from the environment; every one has a default for development. */
export const readConfig = (env: Record<string, string | undefined>) => {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) return { ok: false as const, error: z.prettifyError(parsed.error) };
  const value = parsed.data;
  const config: Config = {
    dataDir: value.STAPEL_DATA_DIR,
    port: value.PORT,
    maxUploadBytes: value.STAPEL_MAX_UPLOAD_MB * MEGABYTE,
    authSecret: value.STAPEL_AUTH_SECRET,
    openSignup: value.STAPEL_OPEN_SIGNUP,
    trustedOrigins: (value.STAPEL_TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
  return { ok: true as const, value: config };
};
