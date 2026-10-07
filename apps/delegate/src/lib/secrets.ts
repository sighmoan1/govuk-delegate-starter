import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashSecret(secret: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(secret, salt, 32).toString("hex")}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const a = scryptSync(secret, salt, 32);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// scrypt is slow on purpose, and the check API runs it on every request a
// service makes. Remember keys that have already verified (by their SHA-256,
// never the key itself), so a busy service is checked once, not per request.
const verified = new Set<string>();
export function verifySecretCached(secret: string, stored: string): boolean {
  const id = `${stored}:${createHash("sha256").update(secret).digest("hex")}`;
  if (verified.has(id)) return true;
  const ok = verifySecret(secret, stored);
  if (ok) verified.add(id);
  return ok;
}
