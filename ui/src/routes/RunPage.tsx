import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { useTitle } from '../hooks/useTitle';
import { Skeleton, SkeletonList } from '../components/Skeleton';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { formatDurationMs, formatDateTime } from '../lib/format';
import type { RunDetail, Scorecard, Finding } from '../types';
import type { JSX } from 'react';
import { BASE_PATH } from '../basePath';

// ── Score color helpers ──────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return '#0E9F6E';
  if (score >= 60) return '#4166F5';
  if (score >= 40) return '#D97706';
  return '#E02424';
}

function scoreBgColor(score: number): string {
  if (score >= 80) return '#ECFDF5';
  if (score >= 60) return '#ECF2FD';
  if (score >= 40) return '#FEF3C7';
  return '#FEE2E2';
}

// ── Severity config ──────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<Finding['severity'], { label: string; bg: string; text: string }> = {
  critical: { label: 'Critical', bg: 'bg-[#FEE2E2]', text: 'text-[#E02424]' },
  high:     { label: 'High',     bg: 'bg-[#FED7AA]', text: 'text-[#EA580C]' },
  medium:   { label: 'Medium',   bg: 'bg-[#ECF2FD]', text: 'text-[#4166F5]' },
  low:      { label: 'Low',      bg: 'bg-[#F1F5F9]', text: 'text-[#64748B]' },
};

const SEVERITY_ORDER: Finding['severity'][] = ['critical', 'high', 'medium', 'low'];

// ── Relevance badge config ───────────────────────────────────────────

const RELEVANCE_STYLES: Record<string, string> = {
  high:   'bg-[#ECFDF5] text-[#0E9F6E]',
  medium: 'bg-[#ECF2FD] text-[#4166F5]',
  low:    'bg-[#FEF3C7] text-[#D97706]',
  none:   'bg-[#F1F5F9] text-[#64748B]',
};

// ── Category display names ───────────────────────────────────────────

const CATEGORY_NAMES: Record<string, string> = {
  messaging_fit: 'Messaging Fit',
  trust_credibility: 'Trust & Credibility',
  objection_handling: 'Objection Handling',
  ux_accessibility: 'UX & Accessibility',
  conversion_cta: 'Conversion & CTA',
  competitive_positioning: 'Competitive Positioning',
};

// ── SSE event types ──────────────────────────────────────────────────

interface PipelineEvent {
  type: string;
  step: string | null;
  label?: string;
  persona_ids?: number[];
  content_source?: string;
  duration_ms?: number;
  error?: string;
  truncated?: boolean;
}

// ── Main component ───────────────────────────────────────────────────

export function RunPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi<RunDetail>(id ? `/api/runs/${id}` : null);

  useTitle(data ? `Run ${id?.slice(0, 8)}` : 'Run Detail');

  // No polling — RunningView uses SSE for live updates and calls
  // onPipelineDone() when the pipeline finishes, which triggers
  // a single reload to fetch the completed scorecard data.

  // Only show skeleton on the very first load (no data at all).
  // After that, keep showing the current view while reloading in the background.
  if (loading && !data) {
    return (
      <section className="px-6 py-6">
        <Skeleton className="h-6 w-48 rounded-lg" />
        <div className="mt-6">
          <SkeletonList count={4} className="h-24 w-full rounded-xl" gap="gap-4" />
        </div>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="px-6 py-6">
        <EmptyState tone="error">Failed to load run: {error.message ?? error.error}</EmptyState>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-4 rounded-xl bg-[#4166F5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3354D1]"
        >
          Back to Analysis
        </button>
      </section>
    );
  }

  if (!data) return <section className="px-6 py-6"><EmptyState>No data.</EmptyState></section>;

  if (data.status === 'running') return <RunningView run={data} runId={id!} onPipelineDone={reload} />;
  if (data.status === 'failed') return <FailedView run={data} />;
  return <CompletedView run={data} />;
}

// ── Running view with real SSE ──────────────────────────────────────

function RunningView({ run, runId, onPipelineDone }: { run: RunDetail; runId: string; onPipelineDone: () => void }): JSX.Element {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onPipelineDoneRef = useRef(onPipelineDone);
  onPipelineDoneRef.current = onPipelineDone;

  // Track elapsed time — stop when pipeline is done
  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => setElapsed(Date.now() - run.started_at), 500);
    return () => clearInterval(timer);
  }, [run.started_at, done]);

  // Fallback: if SSE doesn't deliver a completion event (e.g. Worker timeout),
  // poll status every 10s via a lightweight fetch that doesn't trigger skeletons.
  useEffect(() => {
    if (done) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`${BASE_PATH}/api/runs/${runId}`);
        if (!res.ok) return;
        const data = await res.json() as { status: string };
        if (data.status === 'completed' || data.status === 'failed') {
          setDone(true);
          clearInterval(poll);
          setTimeout(() => onPipelineDoneRef.current(), 500);
        }
      } catch { /* ignore */ }
    }, 10000);
    return () => clearInterval(poll);
  }, [runId, done]);

  // Subscribe to SSE with reconnection
  useEffect(() => {
    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      if (cancelled) return;
      const es = new EventSource(`${BASE_PATH}/api/runs/${runId}/events`);
      eventSourceRef.current = es;

      const EVENT_TYPES = [
        'pipeline.started', 'step.started', 'step.completed',
        'step.failed', 'step.progress', 'pipeline.completed', 'pipeline.failed',
      ];

      function handleEvent(e: MessageEvent) {
        try {
          const parsed = JSON.parse(e.data) as PipelineEvent;
          setEvents(prev => {
            const next = [...prev, parsed];
            return next.length > 100 ? next.slice(-100) : next;
          });

          // Pipeline finished — stop the timer and reload the run data
          // after a brief delay so the user sees the final step
          if (parsed.type === 'pipeline.completed' || parsed.type === 'pipeline.failed') {
            setDone(true);
            es.close();
            setTimeout(() => onPipelineDoneRef.current(), 1500);
          }
        } catch { /* skip malformed events */ }
      }

      for (const type of EVENT_TYPES) es.addEventListener(type, handleEvent);

      es.onerror = () => {
        es.close();
        if (!cancelled) retryTimeout = setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimeout);
      eventSourceRef.current?.close();
    };
  }, [runId]);

  const inputLabel = run.input_url
    ? run.input_url.replace(/^https?:\/\//, '').slice(0, 80)
    : run.input_type === 'file' ? 'Uploaded file' : 'Pasted text';

  const dateStr = formatDateTime(run.started_at);

  return (
    <section className="px-6 py-6">
      <h1 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
        Analysis in Progress
      </h1>

      {/* Run metadata */}
      <Card className="mt-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Input</span>
            <p className="mt-0.5 text-[#0F172A]">{inputLabel}</p>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Personas</span>
            <p className="mt-0.5 text-[#0F172A]">{run.persona_ids.length} selected</p>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Started</span>
            <p className="mt-0.5 text-[#0F172A]">{dateStr}</p>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Elapsed</span>
            <p className="mt-0.5 font-mono text-[#0F172A]">{formatDurationMs(elapsed)}</p>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Run By</span>
            <p className="mt-0.5 text-[#0F172A]">{run.created_by}</p>
          </div>
        </div>
      </Card>

      {/* Pipeline progress — structured by phase */}
      <PipelineProgress events={events} />
    </section>
  );
}

// ── Structured pipeline progress ─────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'done' | 'failed';

interface ParsedStep {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
  error?: string;
}

function PipelineProgress({ events }: { events: PipelineEvent[] }): JSX.Element {
  const { extraction, personas, pipelineDone } = useMemo(() => {
    // Derive structured state from flat event list
    let extraction: ParsedStep = { id: 'fetch', label: 'Extracting content', status: 'pending' };
    const personaMap = new Map<string, ParsedStep>();
    let pipelineDone = false;

    for (const evt of events) {
      const stepId = evt.step ?? '';

      if (stepId === 'fetch' && evt.type === 'step.started') {
        extraction = { ...extraction, status: 'running', label: evt.label ?? 'Fetching content...' };
      } else if (stepId === 'fetch' && evt.type === 'step.completed') {
        extraction = { ...extraction, status: 'done', detail: evt.label };
      } else if (stepId === 'fetch' && evt.type === 'step.failed') {
        extraction = { ...extraction, status: 'failed', error: evt.error };
      } else if (stepId.startsWith('analyze:')) {
        const personaKey = stepId;
        const existing = personaMap.get(personaKey) ?? { id: personaKey, label: '', status: 'pending' as StepStatus };
        if (evt.type === 'step.started') {
          personaMap.set(personaKey, { ...existing, status: 'running', label: evt.label ?? 'Analyzing...' });
        } else if (evt.type === 'step.completed') {
          personaMap.set(personaKey, { ...existing, status: 'done', detail: evt.label });
        } else if (evt.type === 'step.failed') {
          personaMap.set(personaKey, { ...existing, status: 'failed', error: evt.error ?? evt.label });
        }
      } else if (evt.type === 'pipeline.started') {
        extraction = { ...extraction, status: 'running' };
      } else if (evt.type === 'pipeline.completed' || evt.type === 'pipeline.failed') {
        pipelineDone = true;
      }
    }

    return {
      extraction,
      personas: Array.from(personaMap.values()),
      pipelineDone,
    };
  }, [events]);

  const noEvents = events.length === 0;

  return (
    <Card className="mt-4">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B] mb-4">
        Pipeline
      </h2>

      {/* Phase 1: Content extraction */}
      <StepRow
        status={noEvents ? 'running' : extraction.status}
        label={noEvents ? 'Initializing pipeline...' : extraction.label}
        detail={extraction.detail}
        error={extraction.error}
      />

      {/* Phase 2: Per-persona analysis */}
      {personas.length > 0 && (
        <div className="mt-3 border-t border-[#E2E8F0] pt-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#94A3B8]">
            Persona Analysis
            <span className="ml-1.5 font-normal">
              ({personas.filter(p => p.status === 'done').length}/{personas.length} complete)
            </span>
          </p>
          <div className="flex flex-col gap-1">
            {personas.map((p) => (
              <StepRow
                key={p.id}
                status={p.status}
                label={p.label}
                detail={p.detail}
                error={p.error}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pipeline done */}
      {pipelineDone && (
        <div className="mt-3 border-t border-[#E2E8F0] pt-3">
          <StepRow status="done" label="Loading results..." />
        </div>
      )}
    </Card>
  );
}

const CHECK_GREEN = (
  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ECFDF5]">
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 7l3 3 5-5" stroke="#0E9F6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

const X_RED = (
  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FEE2E2]">
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M4 4l6 6M10 4l-6 6" stroke="#E02424" strokeWidth="2" strokeLinecap="round" />
    </svg>
  </span>
);

const SPINNER = <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#4166F5] border-t-transparent" />;

const DOT_PENDING = (
  <span className="flex h-6 w-6 items-center justify-center">
    <span className="h-2.5 w-2.5 rounded-full bg-[#E2E8F0]" />
  </span>
);

function StepRow({ status, label, detail, error }: { status: StepStatus; label: string; detail?: string; error?: string }): JSX.Element {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center">
        {status === 'done' && CHECK_GREEN}
        {status === 'failed' && X_RED}
        {status === 'running' && SPINNER}
        {status === 'pending' && DOT_PENDING}
      </div>
      <div className="min-w-0 flex-1">
        <span className={`text-sm ${
          status === 'failed' ? 'text-[#E02424] font-semibold' :
          status === 'running' ? 'text-[#0F172A] font-semibold' :
          status === 'done' ? 'text-[#64748B]' :
          'text-[#94A3B8]'
        }`}>
          {status === 'done' && detail ? detail : label}
        </span>
        {error && <p className="mt-0.5 text-xs text-[#E02424]">{error}</p>}
      </div>
    </div>
  );
}

// ── Failed view ──────────────────────────────────────────────────────

function FailedView({ run }: { run: RunDetail }): JSX.Element {
  const navigate = useNavigate();
  const dateStr = formatDateTime(run.started_at);

  return (
    <section className="px-6 py-6">
      <h1 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B] mb-4">
        Run Failed
      </h1>

      {/* Run metadata */}
      <RunMeta run={run} dateStr={dateStr} />

      <div className="mt-4 rounded-xl border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-3" role="alert">
        <p className="text-sm font-semibold text-[#E02424]">Analysis failed</p>
        <p className="mt-1 text-sm text-[#991B1B]">{run.error ?? 'An unknown error occurred.'}</p>
      </div>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-xl bg-[#4166F5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3354D1]"
        >
          Try Again
        </button>
        {run.error?.includes('Text') && (
          <button
            type="button"
            onClick={() => navigate('/?tab=text')}
            className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-semibold text-[#0F172A] hover:bg-[#F8FAFC]"
          >
            Paste as Text Instead
          </button>
        )}
      </div>
    </section>
  );
}

// ── Completed view (scorecard) ───────────────────────────────────────

function CompletedView({ run }: { run: RunDetail }): JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0);
  const dateStr = formatDateTime(run.started_at);
  const scorecards = run.scorecards;
  const scorecard = scorecards[activeIndex];

  if (!scorecards.length) {
    return (
      <section className="px-6 py-6">
        <EmptyState>No scorecard data available for this run.</EmptyState>
      </section>
    );
  }

  return (
    <section className="px-6 py-6">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/history" className="text-xs text-[#4166F5] hover:underline">History</Link>
        <span className="text-xs text-[#94A3B8]">/</span>
        <span className="text-xs text-[#64748B]">Run {run.id.slice(0, 8)}</span>
      </div>

      {/* Persona tabs — only show if multiple scorecards */}
      {scorecards.length > 1 && (
        <div className="mb-4 flex gap-1 rounded-lg bg-[#F1F5F9] p-1 overflow-x-auto">
          {scorecards.map((sc, i) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors ${
                i === activeIndex
                  ? 'bg-white text-[#0F172A] shadow-sm'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <span>{sc.persona_name}</span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                style={{
                  backgroundColor: scoreBgColor(sc.overall_score),
                  color: scoreColor(sc.overall_score),
                }}
              >
                {sc.overall_score}
              </span>
            </button>
          ))}
        </div>
      )}

      {scorecard && (
        <>
          <ScorecardHeader run={run} scorecard={scorecard} dateStr={dateStr} />
          <SummarySection summary={scorecard.summary} />
          <CategoryBreakdown findings={scorecard.findings} score={scorecard.overall_score} />
          <FindingsSection findings={scorecard.findings} />
        </>
      )}

      {/* Completion footer */}
      <div className="mt-8 border-t border-[#E2E8F0] pt-4 text-xs text-[#94A3B8]">
        Completed {dateStr} · Duration {formatDurationMs(run.total_duration_ms)} · {run.input_word_count?.toLocaleString() ?? '—'} words analyzed · {scorecards.length} persona{scorecards.length !== 1 ? 's' : ''} · Run by {run.created_by}
      </div>
    </section>
  );
}

// ── Shared run metadata card ────────────────────────────────────────

function RunMeta({ run, dateStr }: { run: RunDetail; dateStr: string }): JSX.Element {
  const inputLabel = run.input_url
    ? run.input_url.replace(/^https?:\/\//, '').slice(0, 80)
    : run.input_type === 'file' ? 'Uploaded file' : 'Pasted text';

  return (
    <Card>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Input</span>
          <p className="mt-0.5 text-[#0F172A]">{inputLabel}</p>
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Personas</span>
          <p className="mt-0.5 text-[#0F172A]">{run.persona_ids.length} selected</p>
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Started</span>
          <p className="mt-0.5 text-[#0F172A]">{dateStr}</p>
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Run By</span>
          <p className="mt-0.5 text-[#0F172A]">{run.created_by}</p>
        </div>
      </div>
    </Card>
  );
}

// ── Header section ───────────────────────────────────────────────────

function ScorecardHeader({ run, scorecard, dateStr }: { run: RunDetail; scorecard: Scorecard; dateStr: string }): JSX.Element {
  const color = scoreColor(scorecard.overall_score);
  const bgColor = scoreBgColor(scorecard.overall_score);
  const relevanceStyle = RELEVANCE_STYLES[scorecard.relevance] ?? RELEVANCE_STYLES.none;

  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
      {/* Score ring */}
      <div
        className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4"
        style={{ borderColor: color, backgroundColor: bgColor }}
      >
        <span className="text-2xl font-bold" style={{ color }}>
          {scorecard.overall_score}
        </span>
      </div>

      {/* Meta info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold text-[#0F172A]">{scorecard.persona_name}</h1>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${relevanceStyle}`}>
            {scorecard.relevance} relevance
          </span>
        </div>

        {scorecard.persona_archetype && (
          <p className="mt-0.5 text-sm italic text-[#64748B]">"{scorecard.persona_archetype}"</p>
        )}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#64748B]">
          {run.input_url && (
            <a
              href={run.input_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#4166F5] hover:underline"
            >
              {run.input_url.replace(/^https?:\/\//, '').slice(0, 60)}
            </a>
          )}
          {run.total_duration_ms != null && <span>Duration: {formatDurationMs(run.total_duration_ms)}</span>}
          {run.input_word_count != null && <span>{run.input_word_count.toLocaleString()} words</span>}
          <span>{dateStr}</span>
        </div>
      </div>
    </Card>
  );
}

// ── Summary section ──────────────────────────────────────────────────

function SummarySection({ summary }: { summary: string }): JSX.Element {
  return (
    <Card className="mt-4">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B]">Summary</h2>
      <p className="mt-2 text-sm leading-relaxed text-[#334155]">{summary}</p>
    </Card>
  );
}

// ── Category breakdown ───────────────────────────────────────────────

interface CategoryStats {
  categoryId: string;
  categoryName: string;
  score: number;
  findingCount: number;
}

function computeCategories(findings: Finding[], overallScore: number): CategoryStats[] {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const group = groups.get(f.category_id) ?? [];
    group.push(f);
    groups.set(f.category_id, group);
  }

  const categories: CategoryStats[] = [];
  for (const [catId, catFindings] of groups) {
    const severityPenalties: Record<string, number> = { critical: 25, high: 15, medium: 8, low: 3 };
    let penalty = 0;
    for (const f of catFindings) {
      penalty += severityPenalties[f.severity] ?? 5;
    }
    const catScore = Math.max(0, Math.min(100, overallScore + 10 - penalty));

    categories.push({
      categoryId: catId,
      categoryName: CATEGORY_NAMES[catId] ?? catId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      score: catScore,
      findingCount: catFindings.length,
    });
  }

  categories.sort((a, b) => a.score - b.score);
  return categories;
}

function CategoryBreakdown({ findings, score }: { findings: Finding[]; score: number }): JSX.Element {
  const categories = computeCategories(findings, score);
  if (categories.length === 0) return <></>;

  return (
    <div className="mt-4">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
        Category Breakdown
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => (
          <CategoryCard key={cat.categoryId} category={cat} />
        ))}
      </div>
    </div>
  );
}

function CategoryCard({ category }: { category: CategoryStats }): JSX.Element {
  const color = scoreColor(category.score);
  return (
    <Card padding="sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#0F172A]">{category.categoryName}</h3>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ backgroundColor: scoreBgColor(category.score), color }}
        >
          {category.findingCount} finding{category.findingCount !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-lg font-bold" style={{ color }}>{category.score}</span>
        <div className="flex-1 h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${category.score}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </Card>
  );
}

// ── Findings section ─────────────────────────────────────────────────

function FindingsSection({ findings }: { findings: Finding[] }): JSX.Element {
  if (findings.length === 0) return <></>;

  const grouped = new Map<Finding['severity'], Finding[]>();
  for (const sev of SEVERITY_ORDER) {
    const sevFindings = findings.filter((f) => f.severity === sev);
    if (sevFindings.length > 0) grouped.set(sev, sevFindings);
  }

  return (
    <div className="mt-6">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B]">Findings</h2>
      <div className="mt-3 flex flex-col gap-4">
        {SEVERITY_ORDER.map((sev) => {
          const sevFindings = grouped.get(sev);
          if (!sevFindings) return null;
          return (
            <div key={sev}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8] mb-2">
                {SEVERITY_CONFIG[sev].label} ({sevFindings.length})
              </h3>
              <div className="flex flex-col gap-3">
                {sevFindings.map((f) => (
                  <FindingCard key={f.id} finding={f} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }): JSX.Element {
  const sev = SEVERITY_CONFIG[finding.severity];
  const categoryName = CATEGORY_NAMES[finding.category_id]
    ?? finding.category_id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Card padding="sm" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sev.bg} ${sev.text}`}>
          {sev.label}
        </span>
        <span className="rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[11px] font-semibold text-[#64748B]">
          {categoryName}
        </span>
      </div>
      <h4 className="text-sm font-bold text-[#0F172A]">{finding.title}</h4>
      <p className="text-sm text-[#334155] leading-relaxed">{finding.description}</p>
      {finding.evidence && (
        <blockquote className="bg-[#F8FAFC] border-l-4 border-[#E2E8F0] pl-4 py-2 text-sm text-[#64748B] italic rounded-r-lg">
          {finding.evidence}
        </blockquote>
      )}
      {finding.recommendation && (
        <div className="bg-[#ECF2FD] border-l-4 border-[#4166F5] pl-4 py-2 text-sm text-[#1E3A5F] rounded-r-lg">
          <span className="font-semibold">Recommendation: </span>
          {finding.recommendation}
        </div>
      )}
      {finding.reasoning && (
        <p className="text-xs text-[#94A3B8] leading-relaxed">{finding.reasoning}</p>
      )}
    </Card>
  );
}
