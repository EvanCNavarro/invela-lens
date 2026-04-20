/**
 * `useApi(path)` — GET with stale-while-revalidate caching.
 *
 * On first load: loading=true -> fetch -> data.
 * On revisit (cached): data shown instantly (no skeleton), background
 * revalidation updates only if response differs.
 *
 * `apiRequest(path, init)` — one-shot mutation helper. Pass `init.json`
 * to JSON-encode the body. Call `invalidateCache(pathPrefix)` after
 * mutations to clear stale entries.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BASE_PATH } from '../basePath';

// ── Types ────────────────────────────────────────────────────────────

export type ApiError = { error: string; message?: string; details?: unknown };

// ── Module-level cache (persists across route navigations) ────────────

interface CacheEntry<T = unknown> {
  data: T;
  fetchedAt: number;
  /** JSON string for shallow equality check on revalidation */
  json: string;
}

const cache = new Map<string, CacheEntry>();

/** Clear cache entries whose key starts with `prefix`.
 *  Call after mutations (POST /api/runs, POST /approve, etc.). */
export function invalidateCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

// ── Module-level revalidation tracking ───────────────────────────────
// Tracks in-flight background revalidation fetches. Lives at module scope
// (alongside the cache) so it's independent of component mount/unmount.
// The progress bar subscribes via useSyncExternalStore.

const revalidatingPaths = new Set<string>();
let revalidatingListeners: Array<() => void> = [];

function notifyRevalidating() {
  revalidatingListeners.forEach((fn) => fn());
}

function revalidationSubscribe(listener: () => void): () => void {
  revalidatingListeners.push(listener);
  return () => {
    revalidatingListeners = revalidatingListeners.filter((l) => l !== listener);
  };
}

function revalidationSnapshot(): boolean {
  return revalidatingPaths.size > 0;
}

/** Subscribe to revalidation state from any component (e.g., progress bar). */
export function useIsRevalidating(): boolean {
  return useSyncExternalStore(revalidationSubscribe, revalidationSnapshot);
}

// ── Hook ──────────────────────────────────────────────────────────────

export type UseApiState<T> = {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** True when showing cached data while background revalidation is in flight */
  revalidating: boolean;
  reload: () => void;
};

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useApi<T>(path: string | null): UseApiState<T> {
  // Initialize from cache if available
  const cached = path ? (cache.get(path) as CacheEntry<T> | undefined) : undefined;

  const [data, setData] = useState<T | null>(cached?.data ?? null);
  const [error, setError] = useState<ApiError | null>(null);
  // Only show loading skeleton if we have NO cached data to display
  const [loading, setLoading] = useState<boolean>(path !== null && !cached);
  const [revalidating, setRevalidating] = useState<boolean>(false);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      setRevalidating(false);
      return;
    }

    const entry = cache.get(path) as CacheEntry<T> | undefined;

    // If we have cached data, show it immediately
    if (entry) {
      setData(entry.data);
      setError(null);
      setLoading(false);
      setRevalidating(true);
      // Track at module level — independent of component lifecycle
      revalidatingPaths.add(path);
      notifyRevalidating();
    } else {
      setLoading(true);
      setError(null);
    }

    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;

    apiRequest<T>(path, { method: 'GET', signal: ac.signal })
      .then((result) => {
        if (ac.signal.aborted) return;
        if (result.ok) {
          const json = JSON.stringify(result.value);
          const existing = cache.get(path);
          // Only re-render if data actually changed
          if (!existing || existing.json !== json) {
            setData(result.value);
            cache.set(path, { data: result.value, fetchedAt: Date.now(), json });
          } else {
            // Data unchanged — just update the timestamp
            existing.fetchedAt = Date.now();
          }
          setError(null);
        } else {
          setData(null);
          setError(result.error);
          cache.delete(path);
        }
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        // On network error, keep showing cached data if we have it
        if (!cache.has(path)) {
          setData(null);
          setError({ error: 'network_error', message: errorMessage(e) });
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) {
          setLoading(false);
          setRevalidating(false);
          revalidatingPaths.delete(path);
          notifyRevalidating();
        }
      });

    return () => {
      ac.abort();
      // On unmount: remove this path from revalidation tracking.
      // The fetch was aborted so it won't complete.
      revalidatingPaths.delete(path);
      notifyRevalidating();
    };
  }, [path, tick]);

  const reload = useCallback(() => {
    // Force refetch — clear cache for this path
    if (path) cache.delete(path);
    setTick((t) => t + 1);
  }, [path]);

  return { data, error, loading, revalidating, reload };
}

// ── One-shot request helper ───────────────────────────────────────────

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiError };

export async function apiRequest<T>(
  path: string,
  init?: RequestInit & { json?: unknown; signal?: AbortSignal },
): Promise<ApiResult<T>> {
  const headers = new Headers(init?.headers ?? {});
  let body = init?.body;
  if (init?.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const response = await fetch(`${BASE_PATH}${path}`, { ...init, headers, body });

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return {
      ok: false,
      error: { error: 'parse_error', message: `non-JSON response (status ${response.status})` },
    };
  }

  // Server error envelope: {error: '<code>', message?: '...'}
  if (
    parsed &&
    typeof parsed === 'object' &&
    typeof (parsed as Record<string, unknown>).error === 'string'
  ) {
    return { ok: false, error: parsed as ApiError };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: { error: 'http_error', message: `HTTP ${response.status}` },
    };
  }

  return { ok: true, value: parsed as T };
}
