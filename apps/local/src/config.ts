import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir, tmpdir, userInfo } from "node:os";
import { basename, join, resolve } from "node:path";
import { z } from "zod";

const MEGABYTE = 1024 * 1024;

const configSchema = z.object({
  /** The folder shown as "Meine Dateien"; the desktop app passes the system's documents folder. */
  STAPEL_LOCAL_ROOT: z.string().min(1).optional(),
  /** How the app calls it; the folder's own name by default ("Dokumente"). */
  STAPEL_LOCAL_ROOT_NAME: z.string().min(1).optional(),
  /** The key the desktop app opens the window with (gate.ts); a random one when absent. */
  STAPEL_LOCAL_TOKEN: z.string().min(16, "STAPEL_LOCAL_TOKEN needs at least 16 characters.").optional(),
  /** 0: any free port, which main.ts prints. */
  PORT: z.coerce.number().int().min(0).max(65535).default(0),
  STAPEL_WEB_DIR: z.string().min(1).optional(),
  /** Where images added while editing wait until the file is saved. */
  STAPEL_LOCAL_CACHE: z.string().min(1).optional(),
  STAPEL_MAX_UPLOAD_MB: z.coerce.number().positive().default(512),
});

export type LocalConfig = {
  root: string;
  rootName: string;
  token: string;
  port: number;
  webDir: string | undefined;
  cacheDir: string;
  maxUploadBytes: number;
  userName: string;
};

/** ~/Documents when there is one, else the home folder: for running it by hand. */
const defaultRoot = (home: string) => {
  const documents = join(home, "Documents");
  return existsSync(documents) ? documents : home;
};

const accountName = (): string | undefined => {
  try {
    return userInfo().username;
  } catch {
    return undefined;
  }
};

/** The account's name as a person's name ("tristan" → "Tristan"), shown where an account's would be. */
export const nameOfUser = (env: Record<string, string | undefined>, account = accountName()): string => {
  const name = [env.USER, env.USERNAME, account].find((candidate) => candidate && candidate !== "unknown");
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : "Ich";
};

export const readConfig = (env: Record<string, string | undefined>, home = homedir()) => {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) return { ok: false as const, error: z.prettifyError(parsed.error) };
  const value = parsed.data;
  const root = resolve(value.STAPEL_LOCAL_ROOT ?? defaultRoot(home));
  const config: LocalConfig = {
    root,
    rootName: value.STAPEL_LOCAL_ROOT_NAME ?? (basename(root) || root),
    token: value.STAPEL_LOCAL_TOKEN ?? randomBytes(24).toString("base64url"),
    port: value.PORT,
    webDir: value.STAPEL_WEB_DIR,
    cacheDir: value.STAPEL_LOCAL_CACHE ?? join(tmpdir(), "stapel-local-media"),
    maxUploadBytes: value.STAPEL_MAX_UPLOAD_MB * MEGABYTE,
    userName: nameOfUser(env),
  };
  return { ok: true as const, value: config };
};
