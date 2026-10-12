import { describe, expect, it } from "vitest";
import { publicBriefingDecision } from "../apps/about/src/lib/public-briefing";

describe("public briefing boundary", () => {
  it("permits read-only pages and required assets", () => {
    for (const path of ["/briefing", "/briefing/high-level", "/briefing/detailed", "/briefing/demo", "/briefings/high-level.pptx", "/briefings/detailed.pptx", "/briefings/assets/observatory.png", "/design.css", "/connected-navigation.css", "/connected-navigation.js", "/assets/fonts/LexendDeca-400.woff2", "/assets/fonts/LexendDeca-700.woff2", "/_next/static/chunks/example.js", "/_next/static/chunks/app/briefing/%5Blevel%5D/page.js"]) {
      expect(publicBriefingDecision(path,"GET")).toBe("allow");
      expect(publicBriefingDecision(path,"HEAD")).toBe("allow");
    }
    expect(publicBriefingDecision("/","GET")).toBe("redirect");
  });
  it("excludes private tools, feeds and lookalike paths", () => {
    for(const path of ["/sams-phone", "/console", "/swarm", "/manage-who-can-act", "/api/demo/reset", "/api/research/events", "/api/health", "/briefing/constructor", "/briefing/missing", "/briefings/secret.json", "/briefing%2fdemo", "/briefing/%5Blevel%5D", "/_next/static/%5Blevel%5D%2fsecret", "/_next/static/../server/file", "/_next/static/%2e%2e/server/file", "/_next/static/\\file", "/_next/data/build/sams-phone.json", "/assets/fonts/other.woff2"]) expect(publicBriefingDecision(path,"GET")).toBe("not-found");
  });
  it("rejects every write method on pages and assets, including server action targets", () => {
    for(const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE"])
      for(const path of ["/", "/briefing", "/briefing/demo", "/briefings/high-level.pptx", "/_next/static/chunks/example.js"])
        expect(publicBriefingDecision(path,method)).toBe("method-not-allowed");
  });
});
