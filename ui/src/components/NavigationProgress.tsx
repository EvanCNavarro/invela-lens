/**
 * Navigation progress bar — spec: marketing-tools/docs/APP-STANDARDS.md §3
 *
 * Driven by data revalidation state (useApi's `revalidating`), NOT route changes.
 *   - First visit (no cached data) -> skeleton only, NO progress bar
 *   - Return visit (cached data visible) -> progress bar during
 *     background revalidation, NO skeleton
 *   - Never show both simultaneously
 *
 * All visual values (gradient, shadow, timing, easing) must match the
 * LinkedIn Insights CSS implementation exactly. See APP-STANDARDS.md for
 * the canonical spec table.
 */
import { useEffect, useRef, useCallback } from 'react';

const MIN_VISIBLE_MS = 400;
// Debounce active=false to absorb the unmount/mount gap when React swaps
// route components (old hook unmounts -> brief false -> new hook mounts)
const DEACTIVATE_DEBOUNCE_MS = 50;

/**
 * Imperative progress bar — avoids React state batching issues by
 * manipulating a persistent DOM element directly, same as LinkedIn Insights.
 */
export function NavigationProgress({ active }: { active: boolean }) {
  const barRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<'idle' | 'loading' | 'finishing'>('idle');
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const deactivateRef = useRef<ReturnType<typeof setTimeout>>();

  const start = useCallback(() => {
    const bar = barRef.current;
    const inner = innerRef.current;
    if (!bar || !inner) return;

    clearTimeout(timerRef.current);
    clearTimeout(deactivateRef.current);
    stateRef.current = 'loading';
    startRef.current = Date.now();

    // Reset to 0% with no transition
    inner.style.transition = 'none';
    inner.style.width = '0%';
    bar.style.opacity = '1';
    bar.style.transition = 'none';

    // Force reflow, then animate to 85%
    bar.offsetHeight;
    inner.style.transition = 'width 8s cubic-bezier(0.1, 0.4, 0.2, 1)';
    inner.style.width = '85%';
  }, []);

  const finish = useCallback(() => {
    const bar = barRef.current;
    const inner = innerRef.current;
    if (!bar || !inner || stateRef.current !== 'loading') return;

    const elapsed = Date.now() - startRef.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      stateRef.current = 'finishing';
      inner.style.transition = 'width 200ms ease-out';
      inner.style.width = '100%';
      bar.style.transition = 'opacity 300ms ease 150ms';
      bar.style.opacity = '0';

      timerRef.current = setTimeout(() => {
        stateRef.current = 'idle';
        inner.style.transition = 'none';
        inner.style.width = '0%';
        bar.style.transition = 'none';
      }, 500);
    }, remaining);
  }, []);

  useEffect(() => {
    if (active) {
      clearTimeout(deactivateRef.current);
      if (stateRef.current !== 'loading') {
        start();
      }
    } else {
      // Debounce deactivation to absorb unmount/mount gap
      clearTimeout(deactivateRef.current);
      deactivateRef.current = setTimeout(() => {
        if (stateRef.current === 'loading') {
          finish();
        }
      }, DEACTIVATE_DEBOUNCE_MS);
    }
  }, [active, start, finish]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(deactivateRef.current);
    };
  }, []);

  return (
    <div
      ref={barRef}
      style={{
        position: 'fixed',
        top: 56,
        left: 0,
        right: 0,
        height: 2,
        zIndex: 99,
        pointerEvents: 'none',
        opacity: 0,
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: '0%',
          height: '100%',
          background: 'linear-gradient(90deg, #93B4F8, #4166F5, #6B8DF7)',
          boxShadow: '0 0 8px rgba(65,102,245,0.3)',
          transition: 'none',
        }}
      />
    </div>
  );
}
