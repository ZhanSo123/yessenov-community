import type { CacheStore } from "@/domain/contracts";
import { cacheDel, cacheGet, cacheSet } from "@/lib/cache";

export class LegacyCacheStore implements CacheStore {
  async get<T>(key: string): Promise<T | null> {
    return cacheGet<T>(key);
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await cacheSet(key, value, ttlMs);
  }

  async del(prefixOrKey: string): Promise<void> {
    await cacheDel(prefixOrKey);
  }
}
