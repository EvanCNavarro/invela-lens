/**
 * Single Toast cell. Error variant escalates to role=alert + assertive
 * live-region; everything else stays polite. Action button fires onClick
 * AND dismisses. Animation keyframes are injected once by <ToastViewport>.
 */
import type { JSX } from 'react';
import type { ToastRecord, ToastVariant } from '../hooks/useToast';
import { Card } from './Card';

export type ToastProps = {
  record: ToastRecord;
  onDismiss: (id: string) => void;
};

const VARIANT_ACCENT: Record<ToastVariant, string> = {
  default: 'border-[#E2E8F0]',
  success: 'border-[#A8E4CC]',
  error: 'border-[#F5B5B5]',
  info: 'border-[#93C5FD]',
};

const VARIANT_TITLE_TONE: Record<ToastVariant, string> = {
  default: 'text-[#0F172A]',
  success: 'text-[#0E9F6E]',
  error: 'text-[#E02424]',
  info: 'text-[#4166F5]',
};

export function Toast({ record, onDismiss }: ToastProps): JSX.Element {
  const role = record.variant === 'error' ? 'alert' : 'status';
  const ariaLive = record.variant === 'error' ? 'assertive' : 'polite';

  function handleAction() {
    record.action?.onClick();
    onDismiss(record.id);
  }

  return (
    <Card
      variant="modal"
      padding="sm"
      role={role}
      aria-live={ariaLive}
      aria-atomic="true"
      className={`pointer-events-auto w-full max-w-sm border ${VARIANT_ACCENT[record.variant]} motion-safe:animate-[toastIn_180ms_ease-out]`}
    >
      <div className="flex items-start gap-3 p-1">
        <div className="min-w-0 flex-1">
          {record.title ? (
            <p className={`text-sm font-semibold ${VARIANT_TITLE_TONE[record.variant]}`}>
              {record.title}
            </p>
          ) : null}
          {record.description ? (
            <p className="mt-0.5 text-xs text-[#64748B]">{record.description}</p>
          ) : null}
          {record.action ? (
            <button
              type="button"
              onClick={handleAction}
              className="mt-2 rounded-lg border border-[#E2E8F0] px-2 py-1 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#ECF2FD] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4166F5]"
            >
              {record.action.label}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={() => onDismiss(record.id)}
          className="-mr-1 -mt-1 rounded-lg p-1 text-[#94A3B8] transition-colors hover:bg-[#ECF2FD] hover:text-[#0F172A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4166F5]"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </Card>
  );
}
