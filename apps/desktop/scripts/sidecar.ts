/**
 * Compiles the local server (apps/local) into one executable for the platform the app is built
 * for, where Tauri expects it (externalBin in tauri.conf.json): src-tauri/binaries/
 * stapel-local-<target triple>[.exe]. The triple: STAPEL_SIDECAR_TARGET if set (the workflow sets
 * it for the universal macOS app), else what Tauri passes in TAURI_ENV_TARGET_TRIPLE, else the
 * machine's own (rustc -vV). A universal macOS app gets both architectures in one file.
 *
 * Run: bun scripts/sidecar.ts
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BUN_TARGETS: Record<string, string> = {
  "x86_64-unknown-linux-gnu": "bun-linux-x64",
  "aarch64-unknown-linux-gnu": "bun-linux-arm64",
  "x86_64-pc-windows-msvc": "bun-windows-x64",
  "aarch64-pc-windows-msvc": "bun-windows-arm64",
  "x86_64-apple-darwin": "bun-darwin-x64",
  "aarch64-apple-darwin": "bun-darwin-arm64",
};

const hostTriple = () => {
  const output = Bun.spawnSync(["rustc", "-vV"]).stdout.toString();
  const host = /^host: (.+)$/m.exec(output)?.[1];
  if (!host) throw new Error("rustc -vV names no host; set TAURI_ENV_TARGET_TRIPLE");
  return host.trim();
};

const run = (cmd: string[]) => {
  const result = Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error(`failed: ${cmd.join(" ")}`);
};

const entry = join(import.meta.dir, "../../local/src/main.ts");
const binaries = join(import.meta.dir, "../src-tauri/binaries");
mkdirSync(binaries, { recursive: true });

const compile = (triple: string, outfile: string) => {
  const target = BUN_TARGETS[triple];
  if (!target) throw new Error(`no Bun target for ${triple}`);
  run(["bun", "build", "--compile", "--minify", `--target=${target}`, entry, "--outfile", outfile]);
};

const triple = process.env.STAPEL_SIDECAR_TARGET || process.env.TAURI_ENV_TARGET_TRIPLE || hostTriple();
const suffix = triple.includes("windows") ? ".exe" : "";
const outfile = join(binaries, `stapel-local-${triple}${suffix}`);

if (triple === "universal-apple-darwin") {
  const parts = ["aarch64-apple-darwin", "x86_64-apple-darwin"].map((part) => {
    const file = join(binaries, `stapel-local-${part}`);
    compile(part, file);
    return file;
  });
  run(["lipo", "-create", ...parts, "-output", outfile]);
} else {
  compile(triple, outfile);
}
console.log(`sidecar: ${outfile}`);
