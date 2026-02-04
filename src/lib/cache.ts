import { createHash } from "node:crypto";

import { redis, redisReady } from "@/lib/redis";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const MAX_CACHE_SIZE = 500;
const memoryCache = new Map<string, CacheEntry<unknown>>();

const pruneExpired = (now: number) => {
  for (const [key, entry] of memoryCache) {
    if (entry.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }
};

const enforceMaxSize = () => {
  if (memoryCache.size <= MAX_CACHE_SIZE) {
    return;
  }

  for (const key of memoryCache.keys()) {
    memoryCache.delete(key);
    if (memoryCache.size <= MAX_CACHE_SIZE) {
      break;
    }
  }
};

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  if (redisReady && redis) {
    try {
      const value = await redis.get<T>(key);
      return value ?? null;
    } catch {
      return null;
    }
  }

  const entry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (entry) {
    if (Date.now() > entry.expiresAt) {
      memoryCache.delete(key);
    } else {
      return entry.value;
    }
  }
  return null;
};

export const cacheSet = async <T>(
  key: string,
  value: T,
  ttlMs: number
): Promise<void> => {
  if (redisReady && redis) {
    try {
      const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
      await redis.set(key, value, { ex: ttlSeconds });
      return;
    } catch {
      return;
    }
  }

  const now = Date.now();
  memoryCache.set(key, { value, expiresAt: now + ttlMs });
  pruneExpired(now);
  enforceMaxSize();
};

export const cacheDel = async (prefixOrKey: string): Promise<void> => {
  if (!prefixOrKey) {
    return;
  }

  if (redisReady && redis) {
    try {
      let cursor = "0";
      const match = `${prefixOrKey}*`;
      do {
        const [nextCursor, keys] = (await redis.scan(cursor, {
          match,
          count: 100,
        })) as [string, string[]];
        if (keys.length > 0) {
          await redis.del(...keys);
        }
        cursor = nextCursor;
      } while (cursor !== "0");
      return;
    } catch {
      return;
    }
  }

  for (const key of memoryCache.keys()) {
    if (key === prefixOrKey || key.startsWith(prefixOrKey)) {
      memoryCache.delete(key);
    }
  }
};

const hashCacheKey = (key: string) =>
  createHash("sha256").update(key).digest("hex").slice(0, 12);

export const buildCacheHeaders = (key: string, hit: boolean): HeadersInit => ({
  "x-cache": hit ? "HIT" : "MISS",
  "x-cache-key": hashCacheKey(key),
});
