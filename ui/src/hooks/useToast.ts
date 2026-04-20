/**
 * Toast context + consumer hooks. Three-file split: this module owns the
 * context type + hooks; ToastProvider owns state + API; ToastViewport owns
 * the DOM/animation. Public `useToast` exposes the API only (not the live
 * record list) so dispatchers don't re-render on each toast change.
 * `useToastsInternal` is viewport-only. Both throw outside <ToastProvider>.
 */
import { createContext, useContext } from 'react';

export type ToastVariant = 'default' | 'success' | 'error' | 'info';

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  /** ms until auto-dismiss; default 5000; pass 0 for manual-only. */
  durationMs?: number;
  action?: ToastAction;
};

/** Resolved toast (id assigned by provider, defaults filled in). */
export type ToastRecord = {
  id: string;
  title?: string;
  description?: string;
  variant: ToastVariant;
  durationMs: number;
  action?: ToastAction;
  /** Wall-clock ms when the toast was created (used for FIFO eviction). */
  createdAt: number;
};

export type ToastApi = {
  toast: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
};

export type ToastContextValue = ToastApi & {
  toasts: ReadonlyArray<ToastRecord>;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error(
      'useToast must be used inside a <ToastProvider>. Wrap your app at the root (see ui/src/App.tsx).',
    );
  }
  return { toast: ctx.toast, dismiss: ctx.dismiss, dismissAll: ctx.dismissAll };
}

/** Viewport-only hook returning the full context (incl. live records). */
export function useToastsInternal(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error(
      'useToastsInternal must be used inside a <ToastProvider>. This is a viewport-only hook.',
    );
  }
  return ctx;
}
