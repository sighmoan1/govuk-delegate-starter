// Simulated per-lane throughput. In-memory fixed window: this demonstrates the
// incentive, it is not abuse infrastructure.
const WINDOW_MS = 60_000;
const buckets = new Map<string, { start: number; count: number }>();

export function takeToken(key: string, limit: number, now = Date.now()) {
  let b = buckets.get(key);
  if (!b || now - b.start >= WINDOW_MS) {
    b = { start: now, count: 0 };
    buckets.set(key, b);
  }
  b.count += 1;
  return {
    allowed: b.count <= limit,
    limit,
    remaining: Math.max(0, limit - b.count),
    resetSeconds: Math.ceil((b.start + WINDOW_MS - now) / 1000),
  };
}

export function resetRateLimits() {
  buckets.clear();
}
