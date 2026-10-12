import { readFile, appendFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function plannedUpdate(current, release) {
  const match = current?.match(/^https:\/\/github\.com\/sighmoan1\/bathos-design-system\/releases\/download\/v(\d+\.\d+\.\d+)\/bathos-design-system-\1\.tgz$/);
  if (!match) throw new Error("Expected an exact official release archive dependency");
  if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) throw new Error("Expected a stable semantic release");
  const version = release.tag_name.slice(1);
  const from = match[1].split(".").map(Number), to = version.split(".").map(Number);
  if (to[0] !== from[0]) return null; // Major migrations require a separate owner decision.
  if (to[1] < from[1] || (to[1] === from[1] && to[2] <= from[2])) return null;
  const url = `https://github.com/sighmoan1/bathos-design-system/releases/download/v${version}/bathos-design-system-${version}.tgz`;
  if (!release.assets?.some(asset => asset.browser_download_url === url)) throw new Error("Release package is missing");
  return { version, url };
}

async function main() {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const response = await fetch("https://api.github.com/repos/sighmoan1/bathos-design-system/releases/latest", {
    headers: { Accept: "application/vnd.github+json", ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Release lookup failed: ${response.status}`);
  const update = plannedUpdate(pkg.dependencies?.["@bathos/design-system"], await response.json());
  if (!update) { console.log("No compatible stable upgrade; major versions require migration review."); return; }
  if (process.argv.includes("--check")) { console.log(`Available compatible release: ${update.version}`); return; }
  execFileSync("npm", ["install", "--save-exact", `@bathos/design-system@${update.url}`], { stdio: "inherit" });
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=true\nversion=${update.version}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
