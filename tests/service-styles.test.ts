import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { serviceCss } from "../styles/service-css.mjs";

describe("locally bundled service themes", () => {
  it("retains the supplied theme verbatim and adds only namespaced foundation tokens", () => {
    const supplied = readFileSync(new URL("../styles/design.css", import.meta.url), "utf8");
    const css = serviceCss();
    expect(css).toContain(supplied);
    const foundation = css.slice(0, css.indexOf(supplied));
    expect(foundation).toContain("--bathos-space-6: var(--space-6)");
    expect(foundation).toContain("--bathos-space-6: 2rem;");
    expect(foundation).toContain("--bathos-space-7: 3rem;");
    expect([...foundation.matchAll(/(--[\w-]+)\s*:/g)].every(match => match[1].startsWith("--bathos-"))).toBe(true);
    expect(foundation.replace(/:root\s*\{[^}]*\}/g, "").trim()).toBe("");
    expect(css).not.toMatch(/@import|https?:\/\//);
  });

  it("keeps the One Login theme separate from the prototype's branding", () => {
    const css = serviceCss("onelogin");
    expect(css).toContain("--bathos-space-6: 2rem;");
    expect(css).not.toContain(".brand-link");
    expect(css).not.toContain("@font-face");
    expect(css).not.toMatch(/--(?:ink|focus|link)\s*:/);
  });
});
