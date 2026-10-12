import { describe, expect, it } from "vitest";
import { configuredUpdate, plannedUpdate } from "../scripts/design-system-update.mjs";
const target = { repository: "sighmoan1/govuk-delegate-starter", version: "1.1.0", palette: "stone-vermilion" };

const archive = (version: string) => `https://github.com/sighmoan1/bathos-design-system/releases/download/v${version}/bathos-design-system-${version}.tgz`;
const release = (version: string) => ({ tag_name: `v${version}`, draft: false, prerelease: false, assets: [{ browser_download_url: archive(version) }] });
describe("reviewed foundation upgrades", () => {
  it("accepts only a newer compatible version with the exact official archive", () => {
    expect(plannedUpdate(archive("1.0.1"), release("1.1.0"))).toEqual({ version: "1.1.0", url: archive("1.1.0") });
    expect(plannedUpdate(archive("1.0.1"), release("1.0.2"))?.version).toBe("1.0.2");
    expect(() => plannedUpdate(archive("1.0.1"), { ...release("1.0.2"), assets: [{ browser_download_url: "https://other.example/package.tgz" }] })).toThrow("missing");
  });
  it("never silently performs a major migration, downgrade or prerelease upgrade", () => {
    for (const version of ["2.0.0", "1.0.0", "1.0.1"]) expect(plannedUpdate(archive("1.0.1"), release(version))).toBeNull();
    expect(() => plannedUpdate(archive("1.0.1"), { ...release("1.0.2"), prerelease: true })).toThrow("stable");
    expect(() => plannedUpdate("latest", release("1.0.2"))).toThrow("exact");
  });
  it("uses the exact version and palette selected in the central settings", () => {
    expect(configuredUpdate(target, release("1.1.0"))).toEqual({ version: "1.1.0", palette: "stone-vermilion", url: archive("1.1.0") });
    expect(() => configuredUpdate(target, release("1.0.2"))).toThrow("configured");
  });
});
