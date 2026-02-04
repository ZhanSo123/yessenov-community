import { redis, redisReady } from "@/lib/redis";

type RateLimitEntry = {
  count: number;
  startedAt: number;
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const MOD_WINDOW_MS = 10 * 60_000;
const MOD_MAX_REQUESTS = 60;

// In-memory rate limit for dev/testing. Use a shared store (Redis) in production.
const store = (() => {
  const globalForRateLimit = globalThis as unknown as {
    rateLimitStore?: Map<string, RateLimitEntry>;
    moderationRateLimitStore?: Map<string, RateLimitEntry>;
  };

  if (!globalForRateLimit.rateLimitStore) {
    globalForRateLimit.rateLimitStore = new Map();
  }
  if (!globalForRateLimit.moderationRateLimitStore) {
    globalForRateLimit.moderationRateLimitStore = new Map();
  }

  return globalForRateLimit.rateLimitStore;
})();

const moderationStore = (() => {
  const globalForRateLimit = globalThis as unknown as {
    moderationRateLimitStore?: Map<string, RateLimitEntry>;
  };

  if (!globalForRateLimit.moderationRateLimitStore) {
    globalForRateLimit.moderationRateLimitStore = new Map();
  }

  return globalForRateLimit.moderationRateLimitStore;
})();

export const getClientIp = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }

  return request.headers.get("x-real-ip") ?? "unknown";
};

const rateLimitMemory = (key: string, windowMs: number, max: number) => {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.startedAt > windowMs) {
    store.set(key, { count: 1, startedAt: now });
    return true;
  }

  entry.count += 1;
  store.set(key, entry);

  return entry.count <= max;
};

const rateLimitMemoryModeration = (key: string, windowMs: number, max: number) => {
  const now = Date.now();
  const entry = moderationStore.get(key);

  if (!entry || now - entry.startedAt > windowMs) {
    moderationStore.set(key, { count: 1, startedAt: now });
    return true;
  }

  entry.count += 1;
  moderationStore.set(key, entry);

  return entry.count <= max;
};

const rateLimitRedis = async (
  key: string,
  windowMs: number,
  max: number
) => {
  if (!redisReady || !redis) {
    return null;
  }

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, windowMs);
    } else {
      const ttl = await redis.pttl(key);
      if (ttl < 0) {
        await redis.pexpire(key, windowMs);
      }
    }
    return count <= max;
  } catch {
    return null;
  }
};

export const rateLimit = async (request: Request, keyOverride?: string) => {
  const key = `rate:${keyOverride ?? getClientIp(request)}`;
  const redisResult = await rateLimitRedis(key, WINDOW_MS, MAX_REQUESTS);
  if (redisResult !== null) {
    return redisResult;
  }

  return rateLimitMemory(key, WINDOW_MS, MAX_REQUESTS);
};

export const rateLimitModeration = async (request: Request, actorId: string) => {
  const key = `rate:mod:${actorId}`;
  const redisResult = await rateLimitRedis(key, MOD_WINDOW_MS, MOD_MAX_REQUESTS);
  if (redisResult !== null) {
    return redisResult;
  }

  return rateLimitMemoryModeration(key, MOD_WINDOW_MS, MOD_MAX_REQUESTS);
};
