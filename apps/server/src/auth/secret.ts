import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * The secret that signs session cookies: from the configuration, or else generated once and kept
 * in the data folder (readable by the server only), so sessions survive a restart without setup.
 */
export const loadSecret = async (configured: string | undefined, file: string): Promise<string> => {
  if (configured) return configured;
  try {
    return (await readFile(file, "utf8")).trim();
  } catch (error) {
    if ((error as { code?: unknown }).code !== "ENOENT") throw error;
  }
  const secret = randomBytes(32).toString("base64url");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${secret}\n`, { mode: 0o600, flag: "wx" });
  return secret;
};
