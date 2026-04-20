/**
 * Fixed-position region rendering the stack of <Toast> records. Mount once
 * inside <ToastProvider>. ESC scopes to the focused cell only (handler is on
 * the region, not document) so it doesn't compete with modal ESC handlers.
 */
import { useCallback, useEffect } from 'react';
import type { JSX, KeyboardEvent } from 'react';
import { useToastsInternal } from '../hooks/useToast';
import { Toast } from './Toast';

const TOAST_KEYFRAMES = `
@keyframes toastIn {
  from { opacity: 0; transform: translateX(8px) scale(0.98); }
  to   { opacity: 1; transform: translateX(0) scale(1); }
}
`;
const STYLE_ID = 'invela-toast-keyframes';

export function ToastViewport(): JSX.Element | null {
  const { toasts, dismiss } = useToastsInternal();

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      const cell = active.closest<HTMLElement>('[data-toast-id]');
      const id = cell?.getAttribute('data-toast-id');
      if (id) {
        e.stopPropagation();
        dismiss(id);
      }
    },
    [dismiss],
  );

  // Idempotent keyframe injection (HMR + test double-mount safe).
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = TOAST_KEYFRAMES;
    document.head.appendChild(el);
  }, []);

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      onKeyDown={onKeyDown}
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-end gap-2 px-4 sm:inset-x-auto sm:right-4"
    >
      {toasts.map((record) => (
        <div key={record.id} data-toast-id={record.id} className="w-full sm:w-auto">
          <Toast record={record} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}
