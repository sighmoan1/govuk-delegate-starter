/** Boundary for the separate public About instance; the local console remains private. */
const pages = new Set(["/", "/briefing", "/briefing/high-level", "/briefing/detailed", "/briefing/demo"]);
const files = new Set([
  "/briefings/high-level.pptx", "/briefings/detailed.pptx", "/briefings/assets/observatory.png", "/design.css",
  "/assets/fonts/LexendDeca-400.woff2", "/assets/fonts/LexendDeca-700.woff2",
]);
export function publicBriefingDecision(pathname: string, method: string): "allow" | "redirect" | "not-found" | "method-not-allowed" {
  // Never interpret an encoded path as a second route, including through static files.
  if (pathname.includes("%") || pathname.includes("\\") || pathname.split("/").some(s => s === "." || s === "..")) return "not-found";
  if (!pages.has(pathname) && !files.has(pathname) && !pathname.startsWith("/_next/static/")) return "not-found";
  // Next server actions can POST to an ordinary page. Reject them before rendering.
  if (method !== "GET" && method !== "HEAD") return "method-not-allowed";
  return pathname === "/" ? "redirect" : "allow";
}
export function publicBriefingMode() { return process.env.PUBLIC_BRIEFING_MODE === "true"; }
