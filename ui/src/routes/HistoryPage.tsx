/**
 * HistoryPage — paginated, filterable table of all analysis runs.
 *
 * Columns: Input · Personas · Avg Score · Findings · Duration · Status · Run By · Run At
 *
 * Adapted from Logo Finder HistoryPage pattern — same Dropdown filter,
 * same responsive table/card layout, same pagination nav.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useTitle } from '../hooks/useTitle';
import { Dropdown } from '../components/Dropdown';
import { EmptyState } from '../components/EmptyState';
import { SkeletonList } from '../components/Skeleton';
import { formatDurationMs } from '../lib/format';
import type { RunListResponse, RunListItem, RunStatus } from '../types';

const PAGE_SIZE = 50;
const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

type SortDirection = 'ascending' | 'descending';

function buildPath(offset: number, status: string): string {
  const params = new URLSearchParams();
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String(offset));
  if (status) params.set('status', status);
  return `/api/runs?${params}`;
}

function inputLabel(run: RunListItem): string {
  if (run.input_url) {
    try {
      return new URL(run.input_url).hostname;
    } catch {
      return run.input_url;
    }
  }
  return run.input_type === 'text' ? 'Pasted text' : '—';
}

function avgScore(run: RunListItem): number | null {
  const scored = run.scorecards.filter((s) => s.overall_score != null);
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((sum, s) => sum + s.overall_score, 0) / scored.length);
}

function totalFindings(run: RunListItem): number {
  return run.scorecards.reduce((sum, s) => sum + s.finding_count, 0);
}

export function HistoryPage() {
  useTitle('Run History');
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [sortDirection, setSortDirection] = useState<SortDirection>('descending');

  const { data, error, loading } = useApi<RunListResponse>(buildPath(offset, statusFilter));
  const runs = data?.runs ?? [];
  const total = data?.total ?? 0;

  const sortedRuns = useMemo(
    () => (sortDirection === 'descending' ? runs : [...runs].sort((a, b) => a.started_at - b.started_at)),
    [runs, sortDirection],
  );

  const toggleSort = () =>
    setSortDirection((prev) => (prev === 'descending' ? 'ascending' : 'descending'));

  function changeStatus(value: string) {
    setStatusFilter(value);
    setOffset(0);
  }

  const prevDisabled = offset === 0;
  const nextDisabled = offset + PAGE_SIZE >= total;

  return (
    <section className="px-6 py-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B]">Run History</h1>
        <Dropdown
          label="Status"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={changeStatus}
        />
      </header>

      {loading ? (
        <>
          <div className="flex flex-col gap-3 sm:hidden">
            <SkeletonList count={5} className="h-32 rounded-xl" gap="gap-3" />
          </div>
          <div className="hidden sm:block">
            <div className="rounded-xl border border-[#E2E8F0] p-1">
              <SkeletonList count={8} className="h-10 rounded-lg" gap="gap-0.5" />
            </div>
          </div>
        </>
      ) : error ? (
        <EmptyState tone="error">
          Failed to load history: {error.message ?? error.error}
        </EmptyState>
      ) : sortedRuns.length === 0 ? (
        <EmptyState>No runs yet — try analyzing some content.</EmptyState>
      ) : (
        <>
          {/* Mobile card list (<sm) */}
          <ul className="flex flex-col gap-2 sm:hidden">
            {sortedRuns.map((run) => (
              <HistoryCard key={run.id} run={run} />
            ))}
          </ul>

          {/* Desktop table (sm+) */}
          <div className="relative hidden overflow-x-auto rounded-xl border border-[#E2E8F0] sm:block after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-8 after:bg-gradient-to-l after:from-white after:to-transparent">
            <table className="w-full text-sm">
              <thead className="bg-white text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
                <tr>
                  <th scope="col" className="px-[14px] py-[10px] text-left">Input</th>
                  <th scope="col" className="px-[14px] py-[10px] text-left">Personas</th>
                  <th scope="col" className="px-[14px] py-[10px] text-left">Score</th>
                  <th scope="col" className="px-[14px] py-[10px] text-left">Findings</th>
                  <th scope="col" className="px-[14px] py-[10px] text-left">Duration</th>
                  <th scope="col" className="px-[14px] py-[10px] text-left">Status</th>
                  <th scope="col" className="px-[14px] py-[10px] text-left">Run By</th>
                  <th
                    scope="col"
                    aria-sort={sortDirection}
                    onClick={toggleSort}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort(); }
                    }}
                    tabIndex={0}
                    className="cursor-pointer px-[14px] py-[10px] text-left hover:text-[#0F172A]"
                  >
                    <span className="flex items-center gap-1 uppercase">
                      Run At
                      <span aria-hidden="true">{sortDirection === 'descending' ? '↓' : '↑'}</span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRuns.map((run) => {
                  const score = avgScore(run);
                  const findings = totalFindings(run);
                  return (
                    <tr
                      key={run.id}
                      onClick={() => navigate(`/runs/${run.id}`)}
                      className="cursor-pointer border-t border-[#E2E8F0] hover:bg-[#ECF2FD]"
                    >
                      <td className="max-w-[200px] truncate px-[14px] py-[10px] text-[#334155]">
                        {inputLabel(run)}
                        {run.input_url && (
                          <span className="ml-1 text-xs text-[#94A3B8]">({run.input_type})</span>
                        )}
                      </td>
                      <td className="px-[14px] py-[10px]">
                        <PersonaList scorecards={run.scorecards} />
                      </td>
                      <td className="px-[14px] py-[10px] font-medium">
                        {score != null ? <ScoreBadge score={score} /> : <span className="text-[#94A3B8]">—</span>}
                      </td>
                      <td className="px-[14px] py-[10px] text-[#94A3B8]">{findings || '—'}</td>
                      <td className="px-[14px] py-[10px] text-[#94A3B8]">{formatDurationMs(run.total_duration_ms)}</td>
                      <td className="px-[14px] py-[10px]"><StatusPill status={run.status} /></td>
                      <td className="px-[14px] py-[10px] text-[#94A3B8]">{run.created_by ?? '—'}</td>
                      <td className="px-[14px] py-[10px] text-[#94A3B8]">
                        {new Date(run.started_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
              <span className="text-[#94A3B8]">
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  disabled={prevDisabled}
                  className="rounded-full border border-[#E2E8F0] px-3 py-1.5 text-[13px] font-medium disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={nextDisabled}
                  className="rounded-full border border-[#E2E8F0] px-3 py-1.5 text-[13px] font-medium disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function HistoryCard({ run }: { run: RunListItem }) {
  const navigate = useNavigate();
  const score = avgScore(run);
  const findings = totalFindings(run);

  return (
    <li
      onClick={() => navigate(`/runs/${run.id}`)}
      className="cursor-pointer rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm transition-colors hover:bg-[#ECF2FD]"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#0F172A]">
          {inputLabel(run)}
        </span>
        <StatusPill status={run.status} />
      </div>
      <div className="mt-2">
        <PersonaList scorecards={run.scorecards} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[#94A3B8]">
        <div>
          <dt className="inline">Score: </dt>
          <dd className="inline font-medium">{score != null ? `${score}/100` : '—'}</dd>
        </div>
        <div>
          <dt className="inline">Findings: </dt>
          <dd className="inline">{findings || '—'}</dd>
        </div>
        <div>
          <dt className="inline">Duration: </dt>
          <dd className="inline">{formatDurationMs(run.total_duration_ms)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="inline">Run at: </dt>
          <dd className="inline">{new Date(run.started_at).toLocaleString()}</dd>
        </div>
        {run.created_by ? (
          <div className="col-span-2">
            <dt className="inline">Run by: </dt>
            <dd className="inline">{run.created_by}</dd>
          </div>
        ) : null}
      </dl>
    </li>
  );
}

function PersonaList({ scorecards }: { scorecards: RunListItem['scorecards'] }) {
  if (scorecards.length === 0) return <span className="text-xs text-[#94A3B8]">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {scorecards.map((s) => (
        <span
          key={s.persona_name}
          className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium text-[#475569]"
        >
          {s.persona_name}
        </span>
      ))}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-[#0E9F6E]' : score >= 60 ? 'text-[#F59E0B]' : 'text-[#E02424]';
  return <span className={`${color} font-semibold`}>{score}</span>;
}

const STATUS_PILL_CLASS: Record<RunStatus, string> = {
  completed: 'bg-[#E7F8F1] text-[#0E9F6E]',
  running: 'bg-[#ECF2FD] text-[#4166F5]',
  failed: 'bg-[#FDEAEA] text-[#E02424]',
};

function StatusPill({ status }: { status: RunStatus }) {
  return (
    <span className={`rounded-full px-[10px] py-[3px] text-[11px] font-semibold uppercase tracking-[0.06em] ${STATUS_PILL_CLASS[status]}`}>
      {status}
    </span>
  );
}
