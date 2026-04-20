/**
 * Skeleton placeholders — match the shape of the content they replace.
 *
 * `Skeleton` — single block (text line, image, header).
 * `SkeletonList` — repeated items in a configurable container layout.
 */
import type { JSX } from 'react';

export type SkeletonProps = {
  /** Tailwind classes for size + shape (e.g. "h-4 w-32 rounded-lg"). */
  className?: string;
  label?: string;
};

export function Skeleton({
  className = 'h-4 w-full rounded-lg',
  label = 'Loading',
}: SkeletonProps): JSX.Element {
  return (
    <span
      role="status"
      aria-busy="true"
      aria-label={label}
      className={`block animate-pulse bg-[#E2E8F0] ${className}`}
    />
  );
}

/**
 * Repeated skeleton items. The `containerClassName` controls the layout —
 * use it for grids, custom gaps, or responsive breakpoints.
 *
 * Examples:
 *   <SkeletonList count={5} gap="gap-1" />                          // tight list
 *   <SkeletonList count={6} containerClassName="grid grid-cols-3 gap-4" />  // grid
 */
export function SkeletonList({
  count,
  className = 'h-10 w-full rounded-lg',
  containerClassName,
  gap = 'gap-2',
}: {
  count: number;
  className?: string;
  /** Full override for the container classes (replaces default flex-col + gap). */
  containerClassName?: string;
  /** Gap between items when using default flex-col layout. Ignored if containerClassName is set. */
  gap?: string;
}): JSX.Element {
  const container = containerClassName ?? `flex flex-col ${gap}`;
  return (
    <div className={container} role="status" aria-label="Loading list">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  );
}
