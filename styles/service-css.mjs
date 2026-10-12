import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const resolve = createRequire(import.meta.url).resolve;

// Build/serve local release bytes. The catalogue is never a runtime dependency.
export function serviceCss(service = "prototype") {
  if (!["prototype", "onelogin"].includes(service)) throw new Error("Unknown service theme");
  const foundation = readFileSync(resolve("@bathos/design-system/styles/foundation.css"), "utf8");
  const palettes = readFileSync(resolve("@bathos/design-system/styles/palettes.css"), "utf8");
  const supplied = service === "prototype"
    ? readFileSync(new URL("./design.css", import.meta.url), "utf8").split("\n").filter(line => !line.startsWith("```")).join("\n")
    : "";
  const adapter = readFileSync(new URL(`./bathos-${service}.css`, import.meta.url), "utf8");
  return [foundation, supplied, adapter, palettes].join("\n");
}
