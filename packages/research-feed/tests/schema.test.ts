import { expect, test } from "vitest";
import { feedAccess, feedQuery, nextCursor, pseudonym, runId } from "../src/index";
const env = { RESEARCH_FEED_ENABLED: "true", RESEARCH_FEED_KEY: "synthetic-key", RESEARCH_PSEUDONYM_KEY: "synthetic-hash" };
test("feed credential grants read access only under explicit non-public opt-in", () => {
  const req = new Request("http://hmrc/api/research/events", { headers: { Authorization: "Bearer synthetic-key" } });
  expect(feedAccess(req, env)).toBe(true);
  expect(feedAccess(req, { ...env, PUBLIC_MODE: "true" })).toBe(false);
  expect(feedAccess(req, { ...env, RESEARCH_FEED_ENABLED: "false" })).toBe(false);
  expect(feedAccess(req, { ...env, RESEARCH_PSEUDONYM_KEY: undefined })).toBe(false);
  expect(feedAccess(new Request(req.url), env)).toBe(false);
  expect(feedAccess(new Request(req.url, { headers: { Authorization: "Bearer wrong-key" } }), env)).toBe(false);
});
test("cursor is bounded, source-scoped and independent of event clocks", () => {
  const cursor = nextCursor("hmrc", "old-source-event-id");
  expect(feedQuery(new Request(`http://hmrc/?cursor=${cursor}&limit=2`), "hmrc")).toEqual({ after: "old-source-event-id", limit: 2 });
  expect(() => feedQuery(new Request(`http://hmrc/?cursor=${cursor}`), "delegate")).toThrow();
  for (const query of ["limit=0", "limit=201", "limit=1.5", "cursor=bad"]) expect(() => feedQuery(new Request(`http://hmrc/?${query}`), "hmrc")).toThrow();
});
test("pseudonyms cannot be joined across source services and UUID tags remain claims", () => {
  const value = "raw-session-or-tag";
  const a = pseudonym("hmrc", "session", value, "secret");
  expect(a.value).not.toContain(value);
  expect(a.value).not.toBe(pseudonym("delegate", "session", value, "secret").value);
  expect(a).toEqual(pseudonym("hmrc", "session", value, "secret"));
  expect(runId("hmrc", "4f37f786-31eb-4bd7-964f-558ce09c76d7", "secret").provenance).toBe("client_claim");
  expect(runId("hmrc", value, "secret").provenance).toBe("pseudonymised");
});
