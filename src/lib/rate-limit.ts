// BOKA OS — Simple in-memory rate limiter for API routes
// Uses sliding window counter per IP/key

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetTime <= now) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Check rate limit. Returns { ok: true } if allowed, or { ok: false, retryAfter } if exceeded.
 * @param key - Unique identifier (e.g. IP + route)
 * @param limit - Max requests per window
 * @param windowMs - Window duration in ms (default 60s)
 */
export function checkRateLimit(
  key: string,
  limit: number = 30,
  windowMs: number = 60_000,
): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetTime <= now) {
    store.set(key, { count: 1, resetTime: now + windowMs });
    return { ok: true };
  }

  entry.count++;
  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { ok: false, retryAfter };
  }
  return { ok: true };
}

/**
 * Helper: apply rate limit to NextRequest, return NextResponse 429 if exceeded.
 * Usage in route handler:
 *   const rl = rateLimit(req, 'chat', 20, 60_000);
 *   if (rl) return rl; // 429 response
 */
export function rateLimit(
  req: { headers: { get: (h: string) => string | null } },
  route: string,
  limit?: number,
  windowMs?: number,
): import('next/server').NextResponse | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  const result = checkRateLimit(`${ip}:${route}`, limit, windowMs);
  if (!result.ok) {
    const { NextResponse } = require('next/server');
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: result.retryAfter },
      { status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
    );
  }
  return null;
}
