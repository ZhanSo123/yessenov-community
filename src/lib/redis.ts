import { createClient, type RedisClientType } from "redis";

type RedisValue = string | number | boolean | null | object;

export type RedisAdapter = {
  get<T = RedisValue>(key: string): Promise<T | null>;
  set<T = RedisValue>(key: string, value: T, options?: { ex?: number; px?: number }): Promise<void>;
  scan(cursor: string, options: { match: string; count: number }): Promise<[string, string[]]>;
  del(...keys: string[]): Promise<void>;
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  pttl(key: string): Promise<number>;
};

const redisUrl = process.env.REDIS_URL ?? "";

const hasRedis = Boolean(redisUrl);

export const redisReady = hasRedis;

const globalForRedis = globalThis as unknown as {
  redis?: RedisAdapter;
  nodeRedis?: RedisClientType;
  nodeRedisConnecting?: Promise<void> | null;
};

const safeParse = (value: string | null) => {
  if (value === null) return null;
  try {
    return JSON.parse(value) as RedisValue;
  } catch {
    return value as RedisValue;
  }
};

const ensureNodeRedis = async (client: RedisClientType) => {
  if (client.isOpen) {
    return;
  }
  if (!globalForRedis.nodeRedisConnecting) {
    globalForRedis.nodeRedisConnecting = client.connect().finally(() => {
      globalForRedis.nodeRedisConnecting = null;
    });
  }
  await globalForRedis.nodeRedisConnecting;
};

const createNodeAdapter = (client: RedisClientType): RedisAdapter => ({
  async get<T>(key: string) {
    await ensureNodeRedis(client);
    const value = await client.get(key);
    return safeParse(value) as T | null;
  },
  async set<T>(key: string, value: T, options?: { ex?: number; px?: number }) {
    await ensureNodeRedis(client);
    const payload = JSON.stringify(value);
    if (options?.ex) {
      await client.set(key, payload, { EX: options.ex });
      return;
    }
    if (options?.px) {
      await client.set(key, payload, { PX: options.px });
      return;
    }
    await client.set(key, payload);
  },
  async scan(cursor: string, options: { match: string; count: number }) {
    await ensureNodeRedis(client);
    const result = await client.scan(cursor, {
      MATCH: options.match,
      COUNT: options.count,
    });
    return [result.cursor, result.keys];
  },
  async del(...keys: string[]) {
    if (keys.length === 0) return;
    await ensureNodeRedis(client);
    await client.del(...keys);
  },
  async incr(key: string) {
    await ensureNodeRedis(client);
    return client.incr(key);
  },
  async pexpire(key: string, ms: number) {
    await ensureNodeRedis(client);
    return client.pExpire(key, ms);
  },
  async pttl(key: string) {
    await ensureNodeRedis(client);
    return client.pTTL(key);
  },
});

const createRedisAdapter = (): RedisAdapter | null => {
  if (hasRedis) {
    if (!globalForRedis.nodeRedis) {
      globalForRedis.nodeRedis = createClient({ url: redisUrl });
    }
    return createNodeAdapter(globalForRedis.nodeRedis);
  }

  return null;
};

export const redis = globalForRedis.redis ?? createRedisAdapter();

if (redis && process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
