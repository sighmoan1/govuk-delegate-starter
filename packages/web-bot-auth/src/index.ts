// Web Bot Auth: verify that an HTTP request was signed by an AI agent's
// operator (RFC 9421 HTTP Message Signatures, as used by ChatGPT agent and
// Google-Agent). This proves WHICH OPERATOR's agent sent the request. It says
// nothing about whose authority the agent is using: that is Delegate.
//
// Verification requires the signature to cover @authority, signature-agent, @method and the
// request target (@target-uri, or @path plus @query when the request has a query), a bounded
// created/expires window and a nonce. Nonces are single-use via a ReplayCache.
// Deployment assumptions: the default cache is per-process, so with several instances a
// captured request can be replayed once per instance until a shared ReplayCache (Redis SET NX PX
// or a unique index) is supplied. x-forwarded-host is trusted only with TRUSTED_PROXY=true.
// Remaining risk: providers that sign only @authority + signature-agent (not method/target) are
// rejected as "missing-components" rather than accepted unbound; server-component callers must
// pass the true path including query. Verification does not bind the request body.
import { createPublicKey, createPrivateKey, sign as edSign, verify as edVerify, randomBytes, type KeyObject } from "node:crypto";

export type Jwk = { kty: string; crv: string; x: string; kid?: string; nbf?: number; exp?: number };
export type Directory = { keys: Jwk[] };

/** Agents we are prepared to recognise, and where their keys are published. */
export type TrustedAgent = { agent: string; name: string; directory: string | Directory };

export const KNOWN_AGENTS: TrustedAgent[] = [
  { agent: "https://chatgpt.com", name: "ChatGPT agent", directory: "https://chatgpt.com/.well-known/http-message-signatures-directory" },
  { agent: "https://agent.bot.goog", name: "Google agent (Gemini)", directory: "https://agent.bot.goog/.well-known/http-message-signatures-directory" },
];

export type RequestLike = { method: string; authority: string; path: string; headers: Record<string, string | null | undefined> };

export type Verification =
  | { verified: true; agent: string; name: string; keyid: string; label: string }
  | { verified: false; reason: VerifyFailure; agent?: string };

export type VerifyFailure =
  | "absent"            // no signature at all: says nothing either way
  | "untrusted-agent"   // signed, but by an operator we don't recognise
  | "malformed"
  | "no-web-bot-auth-signature"
  | "missing-components"   // signature does not cover method + target + authority + signature-agent
  | "missing-freshness"    // no created/expires/nonce, or lifetime longer than we allow
  | "replayed"             // same agent/key/nonce already seen inside its validity window
  | "expired"
  | "not-yet-valid"
  | "unknown-key"
  | "directory-unavailable"
  | "bad-signature";

// ── Structured-field parsing (just enough of RFC 8941 for these headers) ──

type Params = Record<string, string | number | boolean>;
export type SignatureInput = { label: string; components: { name: string; params: string[] }[]; params: Params; raw: string };

function splitTopLevel(value: string): string[] {
  const out: string[] = [];
  let depth = 0, quoted = false, start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '"' && value[i - 1] !== "\\") quoted = !quoted;
    else if (!quoted && c === "(") depth++;
    else if (!quoted && c === ")") depth--;
    else if (!quoted && depth === 0 && c === ",") { out.push(value.slice(start, i).trim()); start = i + 1; }
  }
  out.push(value.slice(start).trim());
  return out.filter(Boolean);
}

function parseParams(s: string): Params {
  const params: Params = {};
  for (const m of s.matchAll(/;\s*([a-z0-9_.*-]+)(?:=("(?:[^"\\]|\\.)*"|[^;]*))?/gi)) {
    const [, k, v] = m;
    if (v === undefined) params[k] = true;
    else if (v.startsWith('"')) params[k] = v.slice(1, -1);
    else if (/^-?\d+$/.test(v)) params[k] = Number(v);
    else params[k] = v;
  }
  return params;
}

export function parseSignatureInput(header: string): SignatureInput[] {
  return splitTopLevel(header).map((member) => {
    const eq = member.indexOf("=");
    const label = member.slice(0, eq).trim();
    const raw = member.slice(eq + 1).trim();
    const close = raw.indexOf(")");
    const inner = raw.slice(1, close);
    const components = [...inner.matchAll(/"([^"]+)"((?:;[a-z0-9_-]+(?:=[^\s;"]+|="[^"]*")?)*)/gi)].map((m) => ({
      name: m[1].toLowerCase(),
      params: m[2] ? m[2].split(";").filter(Boolean) : [],
    }));
    return { label, components, params: parseParams(raw.slice(close + 1)), raw };
  });
}

export function parseSignature(header: string): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  for (const member of splitTopLevel(header)) {
    const m = member.match(/^([^=]+)=:([^:]*):/);
    if (m) out[m[1].trim()] = Buffer.from(m[2], "base64");
  }
  return out;
}

/** RFC 9421 §2.5: the exact bytes that were signed. */
export function signatureBase(input: SignatureInput, req: RequestLike): string | null {
  const lines: string[] = [];
  for (const c of input.components) {
    let value: string | null | undefined;
    switch (c.name) {
      case "@authority": value = req.authority.toLowerCase(); break;
      case "@method": value = req.method.toUpperCase(); break;
      case "@path": value = req.path.split("?")[0] || "/"; break;
      case "@target-uri": value = `https://${req.authority.toLowerCase()}${req.path}`; break;
      case "@query": { const q = req.path.indexOf("?"); value = q >= 0 ? req.path.slice(q) : "?"; break; }
      default: {
        value = req.headers[c.name];
        // RFC 9421 §2.1.2: ;key="x" selects one member of a Structured Field dictionary header.
        const keyParam = c.params.find((p) => p.startsWith("key="));
        if (keyParam && typeof value === "string") {
          const member = keyParam.slice(4).replace(/^"|"$/g, "");
          value = splitTopLevel(value).map((m) => m.trim()).find((m) => m.startsWith(`${member}=`)) ?? null;
        }
      }
    }
    if (value === null || value === undefined) return null;
    const name = `"${c.name}"${c.params.length ? `;${c.params.join(";")}` : ""}`;
    lines.push(`${name}: ${String(value).trim()}`);
  }
  lines.push(`"@signature-params": ${input.raw}`);
  return lines.join("\n");
}

/**
 * Does this set of covered components bind the signature to the actual HTTP
 * method and request target (path, plus query when the request has one)?
 * Accepts the RFC 9421 forms: "@target-uri", or "@method" + "@path" (+ "@query").
 * Authority is covered separately because @target-uri also includes it.
 */
export function coversRequestTarget(names: string[], req: RequestLike): boolean {
  const has = (n: string) => names.includes(n);
  if (!has("@method")) return false;
  const hasQuery = req.path.includes("?");
  if (has("@target-uri")) return true;
  if (!has("@path")) return false;
  return !hasQuery || has("@query");
}

// ── Replay protection ──

/**
 * Remembers (agent, key, nonce) until the signature would have expired anyway.
 * The default is in-process memory: correct for one instance only. With several
 * instances, behind a load balancer, supply a shared store (Redis SET NX PX or
 * a unique-indexed table) implementing this interface via `opts.replayCache`;
 * otherwise a captured request can be replayed once per instance.
 */
export interface ReplayCache {
  /** Record the nonce; return false if it was already recorded and is unexpired. */
  claim(key: string, expiresAtMs: number, nowMs: number): boolean | Promise<boolean>;
}

export class MemoryReplayCache implements ReplayCache {
  private seen = new Map<string, number>();
  constructor(private maxEntries = 50_000) {}
  claim(key: string, expiresAtMs: number, nowMs: number): boolean {
    const prior = this.seen.get(key);
    if (prior !== undefined && prior > nowMs) return false;
    if (this.seen.size >= this.maxEntries) {
      for (const [k, exp] of this.seen) if (exp <= nowMs) this.seen.delete(k);
      // Still full of live entries: fail closed rather than grow without bound.
      if (this.seen.size >= this.maxEntries) return false;
    }
    this.seen.set(key, expiresAtMs);
    return true;
  }
}

const defaultReplayCache = new MemoryReplayCache();
/** Longest validity (expires - created) we accept, and oldest created we accept. */
export const MAX_SIGNATURE_LIFETIME_SECONDS = 300;

/**
 * Trust x-forwarded-host only when the deployment says a trusted reverse proxy
 * sets it (and strips client-supplied copies). Otherwise use the Host header.
 */
export function authorityFromHeaders(headers: Record<string, string | null | undefined>, trustForwardedHost = false, fallback = ""): string {
  const fwd = trustForwardedHost ? headers["x-forwarded-host"]?.split(",")[0].trim() : undefined;
  return fwd || headers.host || fallback;
}

const memo = new WeakMap<object, Map<string, Promise<Verification>>>();
/**
 * Verify at most once per incoming request. Replay protection means a second
 * verification of the same request would (correctly) look like a replay, so
 * code that checks twice in one request must share the first answer. `scope`
 * is the per-request object (the Request or Headers instance).
 */
export function verifyOncePerRequest(scope: object, req: RequestLike, opts?: VerifyOptions): Promise<Verification> {
  const id = `${req.method} ${req.authority} ${req.path}`;
  let m = memo.get(scope);
  if (!m) memo.set(scope, (m = new Map()));
  let p = m.get(id);
  if (!p) m.set(id, (p = verifyRequest(req, opts)));
  return p;
}

// ── Keys ──

const directoryCache = new Map<string, { at: number; dir: Directory }>();
const TEN_MINUTES = 10 * 60_000;

async function loadDirectory(source: string | Directory, fetcher: typeof fetch): Promise<Directory | null> {
  if (typeof source !== "string") return source;
  const hit = directoryCache.get(source);
  if (hit && Date.now() - hit.at < TEN_MINUTES) return hit.dir;
  try {
    const res = await fetcher(source, { headers: { accept: "application/http-message-signatures-directory+json, application/json" } });
    if (!res.ok) return hit?.dir ?? null;
    const dir = (await res.json()) as Directory;
    directoryCache.set(source, { at: Date.now(), dir });
    return dir;
  } catch {
    return hit?.dir ?? null;
  }
}

const keyFromJwk = (jwk: Jwk): KeyObject => createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: jwk.x }, format: "jwk" });

// ── Verify ──

const header = (req: RequestLike, name: string) => req.headers[name] ?? req.headers[name.toLowerCase()] ?? null;

export type VerifyOptions = { trusted?: TrustedAgent[]; now?: number; fetcher?: typeof fetch; skewSeconds?: number; replayCache?: ReplayCache; maxLifetimeSeconds?: number };

export async function verifyRequest(req: RequestLike, opts: VerifyOptions = {}): Promise<Verification> {
  const trusted = opts.trusted ?? KNOWN_AGENTS;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const skew = opts.skewSeconds ?? 60;
  const sigAgentRaw = header(req, "signature-agent");
  const sigInputRaw = header(req, "signature-input");
  const sigRaw = header(req, "signature");
  if (!sigAgentRaw && !sigInputRaw && !sigRaw) return { verified: false, reason: "absent" };
  if (!sigAgentRaw || !sigInputRaw || !sigRaw) return { verified: false, reason: "malformed" };

  // Signature-Agent is a string ("https://x") or a dictionary member (sig1="https://x").
  const agent = sigAgentRaw.trim().replace(/^[a-z0-9_*-]+=/i, "").replace(/^"|"$/g, "");
  const known = trusted.find((t) => t.agent === agent);
  if (!known) return { verified: false, reason: "untrusted-agent", agent };

  let inputs: SignatureInput[];
  let sigs: Record<string, Buffer>;
  try { inputs = parseSignatureInput(sigInputRaw); sigs = parseSignature(sigRaw); } catch { return { verified: false, reason: "malformed", agent }; }

  const candidate = inputs.find((i) => i.params.tag === "web-bot-auth");
  if (!candidate) return { verified: false, reason: "no-web-bot-auth-signature", agent };
  const names = candidate.components.map((c) => c.name);
  // The signature must cover who it is for (@authority), who sent it (signature-agent)
  // and which operation it authorises (method + target, including any query).
  if (!names.includes("@authority") || !names.includes("signature-agent") || !coversRequestTarget(names, req)) return { verified: false, reason: "missing-components", agent };

  const maxLife = opts.maxLifetimeSeconds ?? MAX_SIGNATURE_LIFETIME_SECONDS;
  const created = Number(candidate.params.created);
  const expires = Number(candidate.params.expires);
  const nonce = candidate.params.nonce;
  // Freshness is mandatory: created, a bounded expires, and a nonce to make it single-use.
  if (!Number.isFinite(created) || !Number.isFinite(expires) || typeof nonce !== "string" || !nonce || expires <= created || expires - created > maxLife) {
    return { verified: false, reason: "missing-freshness", agent };
  }
  if (created > now + skew) return { verified: false, reason: "not-yet-valid", agent };
  if (expires < now - skew) return { verified: false, reason: "expired", agent };
  if (now - created > maxLife + skew) return { verified: false, reason: "expired", agent };

  const dir = await loadDirectory(known.directory, opts.fetcher ?? fetch);
  if (!dir) return { verified: false, reason: "directory-unavailable", agent };
  const keyid = String(candidate.params.keyid ?? "");
  const jwk = dir.keys.find((k) => k.kid === keyid && k.kty === "OKP" && k.crv === "Ed25519");
  if (!jwk) return { verified: false, reason: "unknown-key", agent };
  if ((jwk.nbf && now + skew < jwk.nbf) || (jwk.exp && now - skew > jwk.exp)) return { verified: false, reason: "expired", agent };

  const base = signatureBase(candidate, req);
  const sig = sigs[candidate.label];
  if (!base || !sig) return { verified: false, reason: "malformed", agent };
  const ok = edVerify(null, Buffer.from(base), keyFromJwk(jwk), sig);
  if (!ok) return { verified: false, reason: "bad-signature", agent };
  // Only record the nonce once the signature is genuine, so forgeries cannot fill or poison the cache.
  const cache = opts.replayCache ?? defaultReplayCache;
  const fresh = await cache.claim(`${agent}|${keyid}|${nonce}`, (expires + skew) * 1000, (opts.now ?? Date.now()));
  if (!fresh) return { verified: false, reason: "replayed", agent };
  return { verified: true, agent, name: known.name, keyid, label: candidate.label };
}

// ── Test signer: lets the tests (and a local agent) sign like ChatGPT does ──

export function signRequest(
  req: Omit<RequestLike, "headers">,
  key: { privateKeyPem: string; keyid: string; agent: string },
  opts: { now?: number; ttlSeconds?: number; components?: string[]; nonce?: string | null; agentDictionaryKey?: string } = {},
): Record<string, string> {
  const created = Math.floor((opts.now ?? Date.now()) / 1000);
  const expires = created + (opts.ttlSeconds ?? 60);
  const components = opts.components ?? ["@authority", "@method", "@path", ...(req.path.includes("?") ? ["@query"] : []), "signature-agent"];
  const nonce = opts.nonce === undefined ? randomBytes(16).toString("base64") : opts.nonce;
  // ChatGPT-style: Signature-Agent is a dictionary member, covered as "signature-agent";key="sig1".
  const dk = opts.agentDictionaryKey;
  const signatureAgent = dk ? `${dk}="${key.agent}"` : `"${key.agent}"`;
  const wire = (c: string) => (c === "signature-agent" && dk ? `"${c}";key="${dk}"` : `"${c}"`);
  const raw = `(${components.map(wire).join(" ")});created=${created};keyid="${key.keyid}";alg="ed25519";expires=${expires}${nonce === null ? "" : `;nonce="${nonce}"`};tag="web-bot-auth"`;
  const input: SignatureInput = { label: "sig1", components: components.map((name) => ({ name, params: name === "signature-agent" && dk ? [`key="${dk}"`] : [] })), params: {}, raw };
  const base = signatureBase(input, { ...req, headers: { "signature-agent": signatureAgent } });
  if (!base) throw new Error("Could not build signature base");
  const sig = edSign(null, Buffer.from(base), createPrivateKey(key.privateKeyPem));
  return { "signature-agent": signatureAgent, "signature-input": `sig1=${raw}`, signature: `sig1=:${sig.toString("base64")}:` };
}

/** Build a RequestLike from a fetch-style Request (route handlers). */
export function fromRequest(req: Request, opts: { authorityOverride?: string; trustForwardedHost?: boolean } = {}): RequestLike {
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });
  const authority = opts.authorityOverride ?? authorityFromHeaders(headers, opts.trustForwardedHost, url.host);
  return { method: req.method, authority, path: url.pathname + url.search, headers };
}
