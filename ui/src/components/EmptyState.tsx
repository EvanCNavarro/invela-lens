/**
 * Empty / error placeholder paragraph. `muted` uses neutral-400 to clear
 * WCAG AA contrast on the body bg; `error` adds role=alert for AT.
 */
import type { JSX, ReactNode } from 'react';

export type EmptyStateProps = {
  children: ReactNode;
  tone?: 'muted' | 'error';
};

export function EmptyState({ children, tone = 'muted' }: EmptyStateProps): JSX.Element {
  return tone === 'error' ? (
    <p role="alert" className="text-sm text-red-400">
      {children}
    </p>
  ) : (
    <p className="text-sm text-[#94A3B8]">{children}</p>
  );
}
