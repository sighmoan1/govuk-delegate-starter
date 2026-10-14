import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const resolve = createRequire(import.meta.url).resolve;

// Build/serve local release bytes. The catalogue is never a runtime dependency.
export function serviceCss(service = "prototype") {
  if (!["prototype", "onelogin"].includes(service)) throw new Error("Unknown service theme");
  const foundation = readFileSync(resolve("@bathos/design-system/styles/foundation.css"), "utf8");
  // Foundation spacing aliases require token values; bundle only the namespaced
  // spacing values so the package's compatibility colours cannot replace services.
  const tokens = readFileSync(resolve("@bathos/design-system/styles/tokens.css"), "utf8");
  const spacingValues = [...tokens.matchAll(/--space-([1-9]):\s*([^;]+);/g)];
  if (spacingValues.length !== 9) throw new Error("Incomplete foundation spacing tokens");
  const spacing = ":root {\n" + spacingValues.map(([, step, value]) => `  --bathos-space-${step}: ${value};`).join("\n") + "\n}";
  const palettes = readFileSync(resolve("@bathos/design-system/styles/palettes.css"), "utf8");
  const supplied = service === "prototype"
    ? readFileSync(new URL("./design.css", import.meta.url), "utf8").split("\n").filter(line => !line.startsWith("```")).join("\n")
    : "";
  const adapter = readFileSync(new URL(`./bathos-${service}.css`, import.meta.url), "utf8");
  return [foundation, spacing, supplied, adapter, palettes].join("\n");
}
