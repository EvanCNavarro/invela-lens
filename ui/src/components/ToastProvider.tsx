/**
 * Owns the toast queue + API. DOM rendering is delegated to <ToastViewport>;
 * mount the viewport once inside the provider tree. Stack cap MAX_VISIBLE
 * evicts the oldest on overflow (and cancels its pending timer so a stale
 * setToasts doesn't fire). `durationMs: 0` opts out of auto-dismiss. IDs
 * are monotonic strings so React keys stay stable.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { ToastContext, type ToastOptions, type ToastRecord } from '../hooks/useToast';

const MAX_VISIBLE = 5;
const DEFAULT_DURATION_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ReadonlyArray<ToastRecord>>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const idCounterRef = useRef(0);

  function clearTimer(id: string) {
    const t = timersRef.current.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
  }

  const dismiss = useCallback((id: string) => {
    clearTimer(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    for (const handle of timersRef.current.values()) clearTimeout(handle);
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const toast = useCallback((opts: ToastOptions): string => {
    idCounterRef.current += 1;
    const id = `t-${idCounterRef.current}`;
    const record: ToastRecord = {
      id,
      title: opts.title,
      description: opts.description,
      variant: opts.variant ?? 'default',
      durationMs: opts.durationMs ?? DEFAULT_DURATION_MS,
      action: opts.action,
      createdAt: Date.now(),
    };

    setToasts((prev) => {
      const next = [...prev, record];
      while (next.length > MAX_VISIBLE) {
        const removed = next.shift();
        if (removed) clearTimer(removed.id);
      }
      return next;
    });

    if (record.durationMs > 0) {
      const handle = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, record.durationMs);
      timersRef.current.set(id, handle);
    }

    return id;
  }, []);

  // Cancel any pending timers on unmount (tests + HMR).
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const handle of timers.values()) clearTimeout(handle);
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ toast, dismiss, dismissAll, toasts }),
    [toast, dismiss, dismissAll, toasts],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
