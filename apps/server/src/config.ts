import { z } from "zod";

const MEGABYTE = 1024 * 1024;

const configSchema = z.object({
  DATABASE_URL: z.url().default("postgres://stapel:stapel@localhost:5432/stapel"),
  STAPEL_DATA_DIR: z.string().min(1).default("data"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  STAPEL_MAX_UPLOAD_MB: z.coerce.number().positive().default(512),
});

export type Config = {
  databaseUrl: string;
  dataDir: string;
  port: number;
  maxUploadBytes: number;
};

/** Reads the server's settings from the environment; every one has a default for development. */
export const readConfig = (env: Record<string, string | undefined>) => {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) return { ok: false as const, error: z.prettifyError(parsed.error) };
  const { DATABASE_URL, STAPEL_DATA_DIR, PORT, STAPEL_MAX_UPLOAD_MB } = parsed.data;
  const config: Config = {
    databaseUrl: DATABASE_URL,
    dataDir: STAPEL_DATA_DIR,
    port: PORT,
    maxUploadBytes: STAPEL_MAX_UPLOAD_MB * MEGABYTE,
  };
  return { ok: true as const, value: config };
};
