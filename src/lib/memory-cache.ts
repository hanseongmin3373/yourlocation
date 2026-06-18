type CacheEntry<T> = { value: T; expiresAt: number };

/** Simple in-process TTL cache (per server instance). */
export function createMemoryCache<T>(ttlMs: number, maxSize = 500) {
  const map = new Map<string, CacheEntry<T>>();

  return {
    get(key: string): T | undefined {
      const entry = map.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        map.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: T) {
      if (map.size >= maxSize) {
        const oldest = map.keys().next().value;
        if (oldest) map.delete(oldest);
      }
      map.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    delete(key: string) {
      map.delete(key);
    },
  };
}
