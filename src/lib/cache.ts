import { Redis } from "@upstash/redis";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
let redisClient: Redis | null | undefined;

const getRedis = () => {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const provider = process.env.CACHE_PROVIDER;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (provider === "memory" || !url || !token) {
    redisClient = null;
    return null;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
};

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  const entry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (entry) {
    if (Date.now() > entry.expiresAt) {
      memoryCache.delete(key);
    } else {
      return entry.value;
    }
  }

  const redis = getRedis();
  if (!redis) {
    return null;
  }

  try {
    const value = await redis.get<T>(key);
    if (value === null || value === undefined) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
};

export const cacheSet = async <T>(
  key: string,
  value: T,
  ttlMs: number
): Promise<void> => {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });

  const redis = getRedis();
  if (!redis) {
    return;
  }

  try {
    const exSeconds = Math.max(1, Math.round(ttlMs / 1000));
    await redis.set(key, value, { ex: exSeconds });
  } catch {
    // Ignore Redis write errors and rely on memory fallback.
  }
};
