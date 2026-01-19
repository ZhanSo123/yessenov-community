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

export const rateLimit = (request: Request, keyOverride?: string) => {
  const key = keyOverride ?? getClientIp(request);
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.startedAt > WINDOW_MS) {
    store.set(key, { count: 1, startedAt: now });
    return true;
  }

  entry.count += 1;
  store.set(key, entry);

  return entry.count <= MAX_REQUESTS;
};

export const rateLimitModeration = (request: Request, actorId: string) => {
  const key = `mod:${actorId}`;
  const now = Date.now();
  const entry = moderationStore.get(key);

  if (!entry || now - entry.startedAt > MOD_WINDOW_MS) {
    moderationStore.set(key, { count: 1, startedAt: now });
    return true;
  }

  entry.count += 1;
  moderationStore.set(key, entry);

  return entry.count <= MOD_MAX_REQUESTS;
};
