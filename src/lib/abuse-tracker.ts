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
