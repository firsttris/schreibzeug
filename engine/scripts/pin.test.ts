import { describe, expect, it } from "vitest";
import { expectedAssetName, pickAsset } from "./pin";

const asset = (name: string) => ({ name, browser_download_url: `https://example.test/${name}` });

describe("expectedAssetName", () => {
  it("swaps the version in the name, without the tag's v", () => {
    expect(expectedAssetName("euro-office-documentserver_9.3.4-hotfix.1_amd64.deb", "v9.3.7")).toBe(
      "euro-office-documentserver_9.3.7_amd64.deb",
    );
    expect(expectedAssetName("euro-office-documentserver_9.3.6_amd64.deb", "v9.3.7-1")).toBe(
      "euro-office-documentserver_9.3.7-1_amd64.deb",
    );
  });

  it("keeps a name without a version", () => {
    expect(expectedAssetName("x2t.zip", "v9.3.2+3")).toBe("x2t.zip");
  });
});

describe("pickAsset", () => {
  const assets = [
    asset("euro-office-documentserver_9.3.7_arm64.deb"),
    asset("euro-office-documentserver_9.3.7_amd64.deb"),
  ];

  it("picks the asset of the same kind for the new version", () => {
    expect(pickAsset(assets, "euro-office-documentserver_9.3.4-hotfix.1_amd64.deb", "v9.3.7")).toEqual(
      assets[1],
    );
  });

  it("names what the release has when the asset is missing", () => {
    const picked = pickAsset(assets, "euro-office-documentserver_9.3.6_amd64.rpm", "v9.3.7");
    expect(picked).toBeInstanceOf(Error);
    expect((picked as Error).message).toContain("euro-office-documentserver_9.3.7_arm64.deb");
  });
});
