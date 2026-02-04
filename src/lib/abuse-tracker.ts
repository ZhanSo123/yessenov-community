import { redis, redisReady } from "@/lib/redis";

type ActivityEntry = {
  count: number;
  startedAt: number;
};

const store = (() => {
  const globalStore = globalThis as unknown as {
    abuseActivityStore?: Map<string, ActivityEntry>;
  };

  if (!globalStore.abuseActivityStore) {
    globalStore.abuseActivityStore = new Map();
  }

  return globalStore.abuseActivityStore;
})();

const trackMemory = (key: string, windowMs: number) => {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.startedAt > windowMs) {
    const next = { count: 1, startedAt: now };
    store.set(key, next);
    return { allowed: true, count: next.count };
  }

  entry.count += 1;
  store.set(key, entry);
  return { allowed: true, count: entry.count };
};

const trackRedis = async (key: string, windowMs: number) => {
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
    return count;
  } catch {
    return null;
  }
};

export const checkActivityLimit = (
  key: string,
  windowMs: number,
  max: number
) => {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.startedAt > windowMs) {
    const next = { count: 1, startedAt: now };
    store.set(key, next);
    return { allowed: true, count: next.count };
  }

  entry.count += 1;
  store.set(key, entry);
  return { allowed: entry.count <= max, count: entry.count };
};

export const trackActivity = async (
  key: string,
  windowMs: number
): Promise<{ count: number }> => {
  const redisCount = await trackRedis(key, windowMs);
  if (redisCount !== null) {
    return { count: redisCount };
  }

  return trackMemory(key, windowMs);
};
