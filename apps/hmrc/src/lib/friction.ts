// Friction for traffic that will not identify itself. These are honest
// stand-ins (an in-memory counter, a press-and-hold page, a delay), not abuse
// infrastructure. The point is that the trusted route has none of it.
import { LANE_LIMITS } from "./config";

const WINDOW_MS = 60_000;
const buckets = new Map<string, { start: number; count: number }>();

export type Lane = keyof typeof LANE_LIMITS;

export function takeToken(key: string, lane: Lane, now = Date.now()) {
  const limit = LANE_LIMITS[lane];
  let b = buckets.get(key);
  if (!b || now - b.start >= WINDOW_MS) {
    b = { start: now, count: 0 };
    buckets.set(key, b);
  }
  b.count += 1;
  return { allowed: b.count <= limit, limit, remaining: Math.max(0, limit - b.count), resetSeconds: Math.ceil((b.start + WINDOW_MS - now) / 1000) };
}

export const clientKey = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Anonymous page visitors who pass the challenge get this cookie for ten minutes. */
export const CHALLENGE_COOKIE = "hmrc_challenge_passed";
