import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { verifyRequest as verify, signRequest, KNOWN_AGENTS, fromRequest, authorityFromHeaders, MemoryReplayCache, type TrustedAgent, type Directory, type RequestLike } from "../packages/web-bot-auth/src/index";

const jwks = JSON.parse(readFileSync("dev/test-agent.jwks.json", "utf8")) as Directory;
const key = { privateKeyPem: readFileSync("dev/test-agent-private.pem", "utf8"), keyid: jwks.keys[0].kid!, agent: "https://test-agent.local" };
const TEST: TrustedAgent[] = [{ agent: "https://test-agent.local", name: "Test agent", directory: jwks }];

// Each test gets a fresh replay cache unless it is testing replay itself.
const verifyRequest = (r: RequestLike, o: Parameters<typeof verify>[1] = {}) => verify(r, { replayCache: new MemoryReplayCache(), ...o });

const req = { method: "GET", authority: "hmrc.example", path: "/your-tax" };
const signed = (over: Partial<typeof req> = {}, opts = {}) => ({ ...req, ...over, headers: signRequest({ ...req, ...over }, key, opts) });

describe("Web Bot Auth verification", () => {
  it("verifies a correctly signed request and names the agent", async () => {
    const v = await verifyRequest(signed(), { trusted: TEST });
    expect(v).toMatchObject({ verified: true, agent: "https://test-agent.local", name: "Test agent", keyid: key.keyid });
  });

  it("an unsigned request is 'absent': no evidence either way", async () => {
    expect(await verifyRequest({ ...req, headers: { "user-agent": "Mozilla/5.0 Chrome/138" } }, { trusted: TEST })).toEqual({ verified: false, reason: "absent" });
  });

  it("rejects a signature replayed to a different path or a different site", async () => {
    const s = signed();
    expect(await verifyRequest({ ...s, path: "/claim" }, { trusted: TEST })).toMatchObject({ verified: false, reason: "bad-signature" });
    expect(await verifyRequest({ ...s, authority: "evil.example" }, { trusted: TEST })).toMatchObject({ verified: false, reason: "bad-signature" });
  });

  it("rejects an expired signature", async () => {
    const old = signed({}, { now: Date.now() - 3_600_000, ttlSeconds: 60 });
    expect(await verifyRequest(old, { trusted: TEST })).toMatchObject({ verified: false, reason: "expired" });
  });

  it("rejects a signature from an operator we don't recognise, even if it is valid", async () => {
    expect(await verifyRequest(signed(), { trusted: KNOWN_AGENTS })).toMatchObject({ verified: false, reason: "untrusted-agent", agent: "https://test-agent.local" });
  });

  it("requires the signature to cover the site and the agent", async () => {
    const s = signed({}, { components: ["@method", "@path"] });
    expect(await verifyRequest(s, { trusted: TEST })).toMatchObject({ verified: false, reason: "missing-components" });
  });

  it("rejects an unknown key id", async () => {
    const other = { ...key, keyid: "not-a-key" };
    const h = signRequest(req, other);
    expect(await verifyRequest({ ...req, headers: h }, { trusted: TEST })).toMatchObject({ verified: false, reason: "unknown-key" });
  });

  it("the real ChatGPT and Google key directories parse as Ed25519 JWKS", async () => {
    for (const a of KNOWN_AGENTS) {
      const res = await fetch(a.directory as string);
      expect(res.ok, a.agent).toBe(true);
      const dir = (await res.json()) as Directory;
      expect(dir.keys.length, a.agent).toBeGreaterThan(0);
      for (const k of dir.keys) expect(k).toMatchObject({ kty: "OKP", crv: "Ed25519" });
      // A request signed by our test key but claiming to be ChatGPT must fail against the real keys.
      const forged = signRequest(req, { ...key, agent: a.agent, keyid: dir.keys[0].kid! });
      expect(await verifyRequest({ ...req, headers: forged })).toMatchObject({ verified: false, reason: "bad-signature" });
    }
  });

  describe("binding to the HTTP operation", () => {
    it("rejects a signature that does not cover the method", async () => {
      const s = signed({}, { components: ["@authority", "@path", "signature-agent"] });
      expect(await verifyRequest(s, { trusted: TEST })).toMatchObject({ verified: false, reason: "missing-components" });
    });
    it("rejects a signature that does not cover any request target", async () => {
      const s = signed({}, { components: ["@authority", "@method", "signature-agent"] });
      expect(await verifyRequest(s, { trusted: TEST })).toMatchObject({ verified: false, reason: "missing-components" });
    });
    it("rejects a signature reused for a different method", async () => {
      const s = signed();
      expect(await verifyRequest({ ...s, method: "POST" }, { trusted: TEST })).toMatchObject({ verified: false, reason: "bad-signature" });
    });
    it("accepts @target-uri as the covered target", async () => {
      const s = signed({}, { components: ["@authority", "@method", "@target-uri", "signature-agent"] });
      expect(await verifyRequest(s, { trusted: TEST })).toMatchObject({ verified: true });
    });
    it("a path-only signature cannot be used with an added query", async () => {
      const s = signed({}, { components: ["@authority", "@method", "@path", "signature-agent"] });
      expect(await verifyRequest({ ...s, path: "/your-tax?utr=123" }, { trusted: TEST })).toMatchObject({ verified: false, reason: "missing-components" });
    });
    it("a signature over a query cannot be reused with a mutated query", async () => {
      const s = signed({ path: "/claim?id=1" });
      expect(await verifyRequest(s, { trusted: TEST })).toMatchObject({ verified: true });
      expect(await verifyRequest({ ...s, path: "/claim?id=2" }, { trusted: TEST })).toMatchObject({ verified: false, reason: "bad-signature" });
    });
    it("interop: Signature-Agent as a dictionary member covered with ;key= (ChatGPT style)", async () => {
      const s = signed({}, { agentDictionaryKey: "sig1" });
      expect(s.headers["signature-agent"]).toMatch(/^sig1="/);
      expect(await verifyRequest(s, { trusted: TEST })).toMatchObject({ verified: true, agent: "https://test-agent.local" });
    });
  });

  describe("freshness and replay", () => {
    it("rejects a future-dated signature", async () => {
      const s = signed({}, { now: Date.now() + 3_600_000 });
      expect(await verifyRequest(s, { trusted: TEST })).toMatchObject({ verified: false, reason: "not-yet-valid" });
    });
    it("rejects a signature with no nonce", async () => {
      expect(await verifyRequest(signed({}, { nonce: null }), { trusted: TEST })).toMatchObject({ verified: false, reason: "missing-freshness" });
    });
    it("rejects an over-long validity window", async () => {
      expect(await verifyRequest(signed({}, { ttlSeconds: 86_400 }), { trusted: TEST })).toMatchObject({ verified: false, reason: "missing-freshness" });
    });
    it("rejects malformed signature headers", async () => {
      const s = signed();
      expect(await verifyRequest({ ...s, headers: { ...s.headers, signature: "garbage" } }, { trusted: TEST })).toMatchObject({ verified: false });
      expect(await verifyRequest({ ...s, headers: { "signature-agent": s.headers["signature-agent"] } }, { trusted: TEST })).toMatchObject({ verified: false, reason: "malformed" });
    });
    it("rejects the identical request replayed within its validity period", async () => {
      const cache = new MemoryReplayCache();
      const s = signed();
      expect(await verify(s, { trusted: TEST, replayCache: cache })).toMatchObject({ verified: true });
      expect(await verify(s, { trusted: TEST, replayCache: cache })).toMatchObject({ verified: false, reason: "replayed" });
    });
    it("a forged request does not consume the nonce of the genuine one", async () => {
      const cache = new MemoryReplayCache();
      const s = signed();
      const forged = { ...s, headers: { ...s.headers, signature: `sig1=:${Buffer.alloc(64).toString("base64")}:` } };
      expect(await verify(forged, { trusted: TEST, replayCache: cache })).toMatchObject({ reason: "bad-signature" });
      expect(await verify(s, { trusted: TEST, replayCache: cache })).toMatchObject({ verified: true });
    });
    it("distinct signatures for the same request each work once", async () => {
      const cache = new MemoryReplayCache();
      expect(await verify(signed(), { trusted: TEST, replayCache: cache })).toMatchObject({ verified: true });
      expect(await verify(signed(), { trusted: TEST, replayCache: cache })).toMatchObject({ verified: true });
    });
    it("the cache forgets a nonce once its window has passed and fails closed when full", () => {
      const c = new MemoryReplayCache(1);
      expect(c.claim("a", 1000, 0)).toBe(true);
      expect(c.claim("a", 1000, 500)).toBe(false);
      expect(c.claim("b", 3000, 500)).toBe(false);
      expect(c.claim("b", 3000, 1500)).toBe(true);
    });
  });

  describe("forwarded host handling", () => {
    const r = new Request("http://internal:3000/your-tax", { headers: { host: "hmrc.example", "x-forwarded-host": "evil.example" } });
    it("ignores x-forwarded-host unless a trusted proxy is declared", () => {
      expect(authorityFromHeaders({ host: "hmrc.example", "x-forwarded-host": "evil.example" })).toBe("hmrc.example");
      expect(fromRequest(new Request("http://hmrc.example/x", { headers: { "x-forwarded-host": "evil.example" } })).authority).toBe("hmrc.example");
    });
    it("uses it when the deployment trusts its proxy", () => {
      expect(fromRequest(r, { trustForwardedHost: true }).authority).toBe("evil.example");
    });
  });
});
