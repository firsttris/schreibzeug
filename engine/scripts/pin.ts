/**
 * Completes engine.json after its versions were raised (by Renovate or by hand): the release asset
 * of each new version and its SHA-256, which Renovate cannot fill in itself.
 *
 * The asset is the current one with the version in its name swapped for the new one
 * (euro-office-documentserver_9.3.4-hotfix.1_amd64.deb → …_9.3.7_amd64.deb); a name without a
 * version (x2t.zip) stays. The hash is the release asset's `digest` from GitHub's REST API
 * ("Get a release by tag name"), or, for an asset uploaded before GitHub kept digests, the hash of
 * the download.
 *
 * Run: bun engine/scripts/pin.ts   (GITHUB_TOKEN, if set, raises GitHub's rate limit)
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Pin = { source: string; version: string; asset: string; sha256: string };
type ReleaseAsset = { name: string; digest?: string | null; browser_download_url: string };

/** A version as it appears in an asset name: 9.3.4, 9.3.4-hotfix.1, 9.3.7-1. */
const versionInName = /\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?/;

/** The name the asset of `version` should have, judged by the current asset's name. */
export const expectedAssetName = (currentAsset: string, version: string): string =>
  currentAsset.replace(versionInName, version.replace(/^v/, ""));

/** The release asset to pin, or an error naming what the release offers instead. */
export const pickAsset = (
  assets: ReleaseAsset[],
  currentAsset: string,
  version: string,
): ReleaseAsset | Error => {
  const name = expectedAssetName(currentAsset, version);
  return (
    assets.find((asset) => asset.name === name) ??
    new Error(`${version} has no asset ${name}; it has: ${assets.map((asset) => asset.name).join(", ")}`)
  );
};

const githubHeaders = (): Record<string, string> => {
  const token = process.env.GITHUB_TOKEN;
  return {
    accept: "application/vnd.github+json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
};

const releaseAssets = async (pin: Pin): Promise<ReleaseAsset[]> => {
  const repo = new URL(pin.source).pathname.replace(/^\//, "");
  const url = `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(pin.version)}`;
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) throw new Error(`No release ${pin.version} in ${repo}: ${response.status}`);
  return ((await response.json()) as { assets: ReleaseAsset[] }).assets;
};

const sha256OfDownload = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status} ${url}`);
  const hash = createHash("sha256");
  for await (const chunk of response.body) hash.update(chunk);
  return hash.digest("hex");
};

const sha256Of = async (asset: ReleaseAsset): Promise<string> =>
  asset.digest?.startsWith("sha256:")
    ? asset.digest.slice("sha256:".length)
    : sha256OfDownload(asset.browser_download_url);

/** The pin with the asset and hash of its version. */
const resolvePin = async (pin: Pin): Promise<Pin> => {
  const asset = pickAsset(await releaseAssets(pin), pin.asset, pin.version);
  if (asset instanceof Error) throw asset;
  return { ...pin, asset: asset.name, sha256: await sha256Of(asset) };
};

/** Swaps the values in the file's text, so its layout (and the diff) stays as it is. */
const replacePin = (text: string, from: Pin, to: Pin): string =>
  text
    .replace(`"asset": "${from.asset}"`, `"asset": "${to.asset}"`)
    .replace(`"sha256": "${from.sha256}"`, `"sha256": "${to.sha256}"`);

const pinEngine = async (): Promise<void> => {
  const file = join(resolve(import.meta.dir, ".."), "engine.json");
  const text = readFileSync(file, "utf8");
  const spec = JSON.parse(text) as Pin & { converter: Pin };
  let next = text;
  for (const pin of [spec, spec.converter]) {
    const resolved = await resolvePin(pin);
    next = replacePin(next, pin, resolved);
    console.log(`${pin.source} ${pin.version}: ${resolved.asset} ${resolved.sha256}`);
  }
  writeFileSync(file, next);
};

if (import.meta.main) await pinEngine();
