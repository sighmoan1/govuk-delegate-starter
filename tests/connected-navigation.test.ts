import { describe, expect, it } from "vitest";
import { delegateNavigationFromEnv } from "@prototype/connected-navigation";
import { renderConnectedNavigation } from "@prototype/connected-navigation/html";

describe("connected Delegate navigation", () => {
  it("keeps the public menu on verified read-only visitor destinations", () => {
    const links = delegateNavigationFromEnv({
      ABOUT_PUBLIC_URL: "http://localhost:3304",
      DELEGATE_PUBLIC_URL: "https://delegate-demo.example.test",
      HMRC_PUBLIC_URL: "https://hmrc-demo.example.test",
      WHENISBINS_PUBLIC_URL: "https://whenisbins-demo.example.test",
      OBSERVATORY_URL: "https://research.example.test",
    }, { mode: "public", includeObservatory: true });

    expect(links.map((link) => link.id)).toEqual(["about", "demo", "delegate", "hmrc", "whenisbins"]);
    expect(links.find((link) => link.id === "about")?.href).toBe("https://about-demo.bathos.org/briefing");
    expect(links.every((link) => link.href.startsWith("https://"))).toBe(true);
    expect(links.some((link) => /localhost|sams-phone|console|swarm|observatory/i.test(link.href))).toBe(false);
  });

  it("adds local-only service links only when explicitly configured", () => {
    const links = delegateNavigationFromEnv({
      ABOUT_URL: "http://localhost:3304",
      DELEGATE_URL: "http://localhost:3300",
      HMRC_URL: "http://localhost:3302",
      COUNCIL_URL: "http://localhost:3305",
      OBSERVATORY_URL: "http://localhost:3303",
    }, { includeCouncil: true, includeObservatory: true });

    expect(links.map((link) => link.id)).toContain("council");
    expect(links.map((link) => link.id)).toContain("observatory");
  });

  it("renders a drawer with current destination state and no presenter tools", () => {
    const html = renderConnectedNavigation({
      links: delegateNavigationFromEnv({}, { mode: "public" }),
      activeId: "hmrc",
      id: "test-nav",
    });

    expect(html).toContain('aria-label="Delegate prototype services"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("HMRC demonstration");
    expect(html).not.toMatch(/Sam.s phone|Presenter|reset|Observatory/);
  });
});
