/**
 * lib/cache.ts — lightweight in-memory SWR-style cache for API responses.
 *
 * Why not React Query / SWR? Both are excellent, but add ~15-30 kB.
 * For this project's API surface (small, well-defined endpoints) a 50-line
 * cache is sufficient and keeps the bundle lean.
 *
 * Features:
 *  - TTL-based expiry (default 30 s)
 *  - Deduplicates concurrent requests for the same key (request coalescing)
 *  - Manual invalidation by key prefix
 */

type CacheEntry<T> = {
  data: T
  expiresAt: number
}

const store = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

const DEFAULT_TTL_MS = 30_000  // 30 seconds

/**
 * Fetch with cache.
 * If a fresh entry exists → return it immediately (no network).
 * If a request is in-flight for the same key → await it (dedup).
 * Otherwise → fetch, cache, return.
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const now = Date.now()
  const cached = store.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.data as T
  }

  // Dedup: reuse in-flight promise
  if (inflight.has(key)) {
    return inflight.get(key) as Promise<T>
  }

  const promise = fetcher().then(data => {
    store.set(key, { data, expiresAt: now + ttlMs })
    inflight.delete(key)
    return data
  }).catch(err => {
    inflight.delete(key)
    throw err
  })

  inflight.set(key, promise)
  return promise
}

/** Invalidate all cache keys that start with the given prefix. */
export function invalidateCache(prefix: string) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

/** Invalidate everything (e.g. after logout). */
export function clearCache() {
  store.clear()
  inflight.clear()
}
