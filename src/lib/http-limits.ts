export const MAX_WEBHOOK_BODY_BYTES = 128 * 1024;
export const MAX_CONSOLE_MESSAGE_CHARS = 4000;
export const DEFAULT_RATE_LIMIT_MAX = 60;
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

export function isBodyWithinLimit(
  body: string,
  maxBytes = MAX_WEBHOOK_BODY_BYTES,
): boolean {
  return Buffer.byteLength(body, "utf8") <= maxBytes;
}

export function isTextWithinLimit(
  text: string,
  maxChars = MAX_CONSOLE_MESSAGE_CHARS,
): boolean {
  return text.length <= maxChars;
}

export function checkRateLimit(
  key: string,
  maxRequests = DEFAULT_RATE_LIMIT_MAX,
  windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
  now = Date.now(),
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, retryAfterSeconds: 0 };
  }

  if (current.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: maxRequests - current.count,
    retryAfterSeconds: 0,
  };
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
}
