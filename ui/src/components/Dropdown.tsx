/**
 * Custom dropdown — matches the LinkedIn Insights dropdown pattern exactly.
 * Spec: marketing-tools/docs/APP-STANDARDS.md, 03-canonical-spec.md §14.
 *
 * Uses <details>/<summary> for semantic HTML. Click outside and Escape close.
 * Chevron rotates on open. Selected item shows checkmark.
 */
import { useEffect, useRef } from 'react';
import type { JSX } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  label: string;
  options: readonly DropdownOption[];
  value: string;
  onChange: (value: string) => void;
}

const CHEVRON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" className="h-3.5 w-3.5 shrink-0 text-[#4166F5] transition-transform duration-150 [[open]_&]:rotate-180">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" className="h-3.5 w-3.5 shrink-0">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export function Dropdown({ label, options, value, onChange }: DropdownProps): JSX.Element {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (detailsRef.current?.open && !detailsRef.current.contains(e.target as Node)) {
        detailsRef.current.open = false;
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && detailsRef.current?.open) {
        detailsRef.current.open = false;
      }
    }
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  function select(optValue: string) {
    onChange(optValue);
    if (detailsRef.current) detailsRef.current.open = false;
  }

  return (
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
      <span>{label}</span>
      <details ref={detailsRef} className="relative">
        <summary
          className="inline-flex min-w-[120px] cursor-pointer items-center gap-2.5 rounded-lg border border-[#E2E8F0] bg-white px-[14px] py-[10px] text-[13px] font-medium text-[#0F172A] transition-[border-color,box-shadow] duration-[120ms] select-none hover:border-[#4166F5] [&::-webkit-details-marker]:hidden [[open]_&]:border-[#4166F5] [[open]_&]:shadow-[0_0_0_3px_rgba(65,102,245,0.1)]"
          style={{ listStyle: 'none' }}
          aria-haspopup="listbox"
        >
          <span className="flex-1">{selectedLabel}</span>
          {CHEVRON}
        </summary>
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+6px)] z-[100] flex min-w-full animate-[dropdownIn_120ms_ease] flex-col gap-0.5 rounded-lg border border-[#E2E8F0] bg-white p-1.5 shadow-[0_4px_12px_rgba(15,23,42,0.08)]"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={value === opt.value}
              onClick={() => select(opt.value)}
              className={`flex w-full items-center gap-3 rounded-md px-[14px] py-[10px] text-left text-[13px] font-medium transition-[background,color] duration-75 ${
                value === opt.value
                  ? 'bg-[#ECF2FD] text-[#4166F5]'
                  : 'text-[#0F172A] hover:bg-[#F8FAFC] hover:text-[#4166F5]'
              }`}
            >
              <span className="flex-1">{opt.label}</span>
              {value === opt.value && CHECK}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
