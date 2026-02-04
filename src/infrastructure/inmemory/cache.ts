import type { CacheStore } from "@/domain/contracts";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class InMemoryCache implements CacheStore {
  private store = new Map<string, CacheEntry<unknown>>();
  private maxSize = 1000;

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const now = Date.now();
    this.store.set(key, { value, expiresAt: now + ttlMs });
    this.pruneExpired(now);
    this.enforceMaxSize();
  }

  async del(prefixOrKey: string): Promise<void> {
    if (!prefixOrKey) {
      return;
    }
    for (const key of this.store.keys()) {
      if (key === prefixOrKey || key.startsWith(prefixOrKey)) {
        this.store.delete(key);
      }
    }
  }

  private pruneExpired(now: number) {
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  private enforceMaxSize() {
    if (this.store.size <= this.maxSize) {
      return;
    }
    for (const key of this.store.keys()) {
      this.store.delete(key);
      if (this.store.size <= this.maxSize) {
        break;
      }
    }
  }
}
