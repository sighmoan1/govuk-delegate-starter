// styles/design.css (repo root) is supplied wrapped in a markdown code fence.
// Serve it unchanged (fence lines removed) so there is a single source of truth
// shared by every GOV.UK-look app in this repo.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const src = readFileSync(new URL("../../../styles/design.css", import.meta.url), "utf8");
const css = src.split("\n").filter((l) => !l.startsWith("```")).join("\n");
mkdirSync(new URL("../public", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/design.css", import.meta.url), css);
