import { query } from "@/lib/db";

export const MAX_WEBHOOK_BODY_BYTES = 128 * 1024;
export const MAX_CONSOLE_MESSAGE_CHARS = 4000;
export const DEFAULT_RATE_LIMIT_MAX = 60;
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type RateLimitBackend = {
  status(
    key: string,
    maxRequests: number,
    windowMs: number,
    now: number,
  ): Promise<RateLimitResult>;
  record(
    key: string,
    maxRequests: number,
    windowMs: number,
    now: number,
  ): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
  clear(): Promise<void>;
};

type MemoryBucket = { count: number; resetAt: number };

const memoryBuckets = new Map<string, MemoryBucket>();

const memoryBackend: RateLimitBackend = {
  async status(key, maxRequests, windowMs, now) {
    if (windowMs <= 0) {
      return { allowed: true, remaining: maxRequests, retryAfterSeconds: 0 };
    }
    const current = memoryBuckets.get(key);
    if (!current || current.resetAt <= now) {
      return { allowed: true, remaining: maxRequests, retryAfterSeconds: 0 };
    }
    if (current.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      };
    }
    return {
      allowed: true,
      remaining: maxRequests - current.count,
      retryAfterSeconds: 0,
    };
  },
  async record(key, maxRequests, windowMs, now) {
    const current = memoryBuckets.get(key);
    if (!current || current.resetAt <= now) {
      memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
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
  },
  async reset(key) {
    memoryBuckets.delete(key);
  },
  async clear() {
    memoryBuckets.clear();
  },
};

const postgresBackend: RateLimitBackend = {
  async status(key, maxRequests, windowMs, now) {
    if (windowMs <= 0) {
      return { allowed: true, remaining: maxRequests, retryAfterSeconds: 0 };
    }
    const result = await query<{ hit_count: number; expires_at: Date }>(
      `select hit_count, expires_at
       from rate_limit_buckets
       where bucket_key = $1 and expires_at > to_timestamp($2 / 1000.0)`,
      [key, now],
    );
    const row = result.rows[0];
    if (!row) {
      return { allowed: true, remaining: maxRequests, retryAfterSeconds: 0 };
    }
    const expiresAtMs = row.expires_at.getTime();
    if (row.hit_count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((expiresAtMs - now) / 1000)),
      };
    }
    return {
      allowed: true,
      remaining: maxRequests - row.hit_count,
      retryAfterSeconds: 0,
    };
  },
  async record(key, maxRequests, windowMs, now) {
    const result = await query<{ hit_count: number; expires_at: Date }>(
      `insert into rate_limit_buckets (bucket_key, window_started_at, expires_at, hit_count)
       values ($1, to_timestamp($2 / 1000.0), to_timestamp(($2 + $3) / 1000.0), 1)
       on conflict (bucket_key) do update
         set hit_count = case
               when rate_limit_buckets.expires_at <= to_timestamp($2 / 1000.0) then 1
               else rate_limit_buckets.hit_count + 1
             end,
             window_started_at = case
               when rate_limit_buckets.expires_at <= to_timestamp($2 / 1000.0) then to_timestamp($2 / 1000.0)
               else rate_limit_buckets.window_started_at
             end,
             expires_at = case
               when rate_limit_buckets.expires_at <= to_timestamp($2 / 1000.0) then to_timestamp(($2 + $3) / 1000.0)
               else rate_limit_buckets.expires_at
             end,
             updated_at = now()
       returning hit_count, expires_at`,
      [key, now, windowMs],
    );
    const row = result.rows[0];
    const expiresAtMs = row.expires_at.getTime();
    if (row.hit_count > maxRequests) {
      // rolled over the limit: undo the speculative increment so callers cannot game retries
      await query(
        `update rate_limit_buckets
         set hit_count = $2, updated_at = now()
         where bucket_key = $1`,
        [key, maxRequests],
      );
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((expiresAtMs - now) / 1000)),
      };
    }
    return {
      allowed: true,
      remaining: maxRequests - row.hit_count,
      retryAfterSeconds: 0,
    };
  },
  async reset(key) {
    await query(`delete from rate_limit_buckets where bucket_key = $1`, [key]);
  },
  async clear() {
    await query(`delete from rate_limit_buckets`, []);
  },
};

let backend: RateLimitBackend =
  process.env.PRONTO_RATE_LIMIT_BACKEND === "memory"
    ? memoryBackend
    : postgresBackend;

export function useMemoryRateLimitBackendForTests(): void {
  backend = memoryBackend;
}

export function usePostgresRateLimitBackend(): void {
  backend = postgresBackend;
}

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

export async function checkRateLimit(
  key: string,
  maxRequests = DEFAULT_RATE_LIMIT_MAX,
  windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
  now = Date.now(),
): Promise<RateLimitResult> {
  return backend.record(key, maxRequests, windowMs, now);
}

export async function getRateLimitStatus(
  key: string,
  maxRequests = DEFAULT_RATE_LIMIT_MAX,
  windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
  now = Date.now(),
): Promise<RateLimitResult> {
  return backend.status(key, maxRequests, windowMs, now);
}

export async function recordRateLimitHit(
  key: string,
  maxRequests = DEFAULT_RATE_LIMIT_MAX,
  windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
  now = Date.now(),
): Promise<RateLimitResult> {
  return backend.record(key, maxRequests, windowMs, now);
}

export async function resetRateLimit(key: string): Promise<void> {
  await backend.reset(key);
}

export async function resetRateLimitsForTests(): Promise<void> {
  await backend.clear();
  memoryBuckets.clear();
}
