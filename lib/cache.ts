interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlMs) });
}

export function cacheDelete(key: string): void {
  store.delete(key);
}

export function cacheClear(prefix?: string): void {
  if (!prefix) {
    store.clear();
    inflight.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  for (const key of [...inflight.keys()]) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}

export async function cacheGetOrLoad<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const existing = cacheGet<T>(key);
  if (existing !== undefined) return existing;

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = loader()
    .then((value) => {
      cacheSet(key, value, ttlMs);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise as Promise<unknown>);
  return promise;
}

export function cacheSize(): number {
  return store.size;
}
