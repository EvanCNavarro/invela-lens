/**
 * Fixed top-right pill shown while an SSE stream is mid-reconnect.
 * Positioned at top-16 (below the toast viewport) so the persistent
 * "Connection lost" toast and the badge can co-exist.
 */
import type { JSX } from 'react';

export type ReconnectingBadgeProps = {
  visible: boolean;
};

export function ReconnectingBadge({ visible }: ReconnectingBadgeProps): JSX.Element | null {
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Reconnecting"
      className="pointer-events-none fixed right-4 top-16 z-40 flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 shadow-lg motion-safe:animate-[badgeIn_180ms_ease-out]"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" className="animate-spin">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <path d="M14 8a6 6 0 00-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span>Reconnecting...</span>
    </div>
  );
}
