/** In-memory rate limit for public invite token lookups (per IP). */
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 30;
const buckets = new Map();

function prune() {
  const now = Date.now();
  for (const [ip, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(ip);
  }
}

function checkInviteTokenRateLimit(req) {
  prune();
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, bucket);
  }
  bucket.count += 1;
  if (bucket.count > MAX_PER_WINDOW) {
    const retry_after_ms = Math.max(0, bucket.resetAt - now);
    return { ok: false, retry_after_ms };
  }
  return { ok: true };
}

module.exports = { checkInviteTokenRateLimit };
