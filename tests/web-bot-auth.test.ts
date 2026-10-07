import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { verifyRequest, signRequest, KNOWN_AGENTS, type TrustedAgent, type Directory } from "../packages/web-bot-auth/src/index";

const jwks = JSON.parse(readFileSync("dev/test-agent.jwks.json", "utf8")) as Directory;
const key = { privateKeyPem: readFileSync("dev/test-agent-private.pem", "utf8"), keyid: jwks.keys[0].kid!, agent: "https://test-agent.local" };
const TEST: TrustedAgent[] = [{ agent: "https://test-agent.local", name: "Test agent", directory: jwks }];

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
});
