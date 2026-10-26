/**
 * The Tauri CLI for this app. On Linux it is the CLI built from Tauri's sources at the version in
 * package.json, with the patches in ../patches applied; elsewhere it is the published CLI from npm.
 *
 * Why: the CLI's bundler copies libEGL.so and libGLESv2.so from CEF into every Linux package
 * (crates/tauri-bundler/src/bundle/linux/{debian.rs,rpm.rs,appimage/sharun_cef.rs}), and CEF 154
 * no longer ships them, so .deb, .rpm and AppImage all fail. The patch skips the two when CEF has
 * none. Drop this script once a Tauri release carries the fix.
 *
 * The patched CLI is built once per version and patch set, into src-tauri/target/patched-cli/.
 *
 * Run: bun scripts/tauri.ts <tauri arguments>   (package.json: bun run tauri …)
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const app = join(import.meta.dir, "..");
const patches = join(app, "patches");
const cache = join(app, "src-tauri/target/patched-cli");

const run = (cmd: string[], cwd: string = app) => {
  const result = Bun.spawnSync(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error(`failed: ${cmd.join(" ")}`);
};

const cliVersion = (): string => {
  const manifest = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  const version = manifest.devDependencies?.["@tauri-apps/cli"];
  if (!version) throw new Error("package.json names no @tauri-apps/cli version");
  return version;
};

const patchFiles = (): string[] =>
  readdirSync(patches)
    .filter((name) => name.endsWith(".patch"))
    .sort()
    .map((name) => join(patches, name));

/** One folder per version and patch set, so a changed patch builds the CLI anew. */
const cachedBinary = (version: string, files: string[]): string => {
  const hash = createHash("sha256");
  for (const file of files) hash.update(readFileSync(file));
  return join(cache, `${version}-${hash.digest("hex").slice(0, 12)}`, "cargo-tauri");
};

/**
 * A patch that no longer applies most likely means Tauri changed or fixed that code: then it is
 * time to check the release and remove the patch (and this script), see ../patches/README.md.
 */
const applyPatch = (file: string, source: string, version: string) => {
  const check = Bun.spawnSync(["git", "apply", "--check", file], { cwd: source, stderr: "pipe" });
  if (check.exitCode !== 0) {
    throw new Error(
      `${file} no longer applies to the Tauri CLI ${version}. If this Tauri release fixes the ` +
        "missing libEGL.so/libGLESv2.so in the Linux bundles, remove the patch and this script " +
        `(apps/desktop/patches/README.md).\n${check.stderr.toString()}`,
    );
  }
  run(["git", "apply", file], source);
};

const buildPatchedCli = (version: string, files: string[], binary: string) => {
  const source = mkdtempSync(join(tmpdir(), "tauri-cli-"));
  try {
    const tag = `tauri-cli-v${version}`;
    run([
      "git",
      "clone",
      "--quiet",
      "--depth",
      "1",
      "--branch",
      tag,
      "https://github.com/tauri-apps/tauri",
      source,
    ]);
    for (const file of files) applyPatch(file, source, version);
    run(["cargo", "build", "--release", "--locked", "-p", "tauri-cli", "--bin", "cargo-tauri"], source);
    mkdirSync(join(binary, ".."), { recursive: true });
    copyFileSync(join(source, "target/release/cargo-tauri"), binary);
  } finally {
    rmSync(source, { recursive: true, force: true });
  }
};

const linuxCli = (): string[] => {
  const version = cliVersion();
  const files = patchFiles();
  const binary = cachedBinary(version, files);
  if (!existsSync(binary)) {
    console.log(`tauri: building the patched CLI ${version} (once) into ${binary}`);
    buildPatchedCli(version, files, binary);
  }
  return [binary];
};

const npmCli = (): string[] => ["bunx", "tauri"];

/**
 * Settings for quick-sharun, which the bundler runs to make the AppImage; a value already set wins.
 * - STRACE_BINARY: it starts every binary for a few seconds to see which libraries it loads and
 *   cannot stop them without a terminal ("can't access tty; job control turned off"), so the
 *   local server, which keeps running, hangs the build. Only the app itself is traced.
 * - ANYLINUX_LIB=0: its anylinux.c was removed from pkgforge-dev/Anylinux-AppImages, so the
 *   download fails; the library is an optional compatibility helper.
 */
const appImageEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
  STRACE_BINARY: "schreibzeug-desktop",
  ANYLINUX_LIB: "0",
  ...env,
});

const linux = process.platform === "linux";
const cli = linux ? linuxCli() : npmCli();
const result = Bun.spawnSync([...cli, ...process.argv.slice(2)], {
  cwd: app,
  env: linux ? appImageEnv(process.env) : process.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(result.exitCode ?? 1);
