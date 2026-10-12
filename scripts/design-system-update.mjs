import { readFile, appendFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const palettes = ["deep-water-red", "stone-vermilion", "ink-teal"];

export function plannedUpdate(current, release) {
  const match = current?.match(/^https:\/\/github\.com\/sighmoan1\/bathos-design-system\/releases\/download\/v(\d+\.\d+\.\d+)\/bathos-design-system-\1\.tgz$/);
  if (!match) throw new Error("Expected an exact official release archive dependency");
  if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) throw new Error("Expected a stable semantic release");
  const version = release.tag_name.slice(1);
  const from = match[1].split(".").map(Number), to = version.split(".").map(Number);
  if (to[0] !== from[0]) return null;
  if (to[1] < from[1] || (to[1] === from[1] && to[2] <= from[2])) return null;
  const url = `https://github.com/sighmoan1/bathos-design-system/releases/download/v${version}/bathos-design-system-${version}.tgz`;
  if (!release.assets?.some(asset => asset.browser_download_url === url)) throw new Error("Release package is missing");
  return { version, url };
}

export function configuredUpdate(target, release) {
  if (!target || !/^\d+\.\d+\.\d+$/.test(target.version) || !palettes.includes(target.palette)) {
    throw new Error("Missing or invalid local Delegate design-system settings");
  }
  const tag = `v${target.version}`;
  if (release.draft || release.prerelease || release.tag_name !== tag) throw new Error("Expected the configured stable release");
  const url = `https://github.com/sighmoan1/bathos-design-system/releases/download/v${target.version}/bathos-design-system-${target.version}.tgz`;
  if (!release.assets?.some(asset => asset.browser_download_url === url)) throw new Error("Release package is missing");
  return { version: target.version, palette: target.palette, url };
}

async function main() {
  const target = JSON.parse(await readFile("bathos-design-system.json", "utf8"));
  if (!/^\d+\.\d+\.\d+$/.test(target.version) || !palettes.includes(target.palette)) {
    throw new Error("Missing or invalid local Delegate design-system settings");
  }
  const tag = "v" + target.version;
  const response = await fetch("https://api.github.com/repos/sighmoan1/bathos-design-system/releases/tags/" + tag, {
    headers: { Accept: "application/vnd.github+json", ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) {
    console.log(`Configured release ${tag} is not published yet; keeping the current build.`);
    return;
  }
  if (!response.ok) throw new Error(`Release lookup failed: ${response.status}`);

  const release = await response.json();
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const update = configuredUpdate(target, release);
  const current = pkg.dependencies?.["@bathos/design-system"];
  if (current?.endsWith("/v" + update.version + "/bathos-design-system-" + update.version + ".tgz")) {
    console.log("Delegate already uses " + update.version + " and " + update.palette + ".");
    return;
  }
  execFileSync("npm", ["install", "--save-exact", `@bathos/design-system@${update.url}`], { stdio: "inherit" });
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=true\nversion=${config.version}\npalette=${config.palette}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
