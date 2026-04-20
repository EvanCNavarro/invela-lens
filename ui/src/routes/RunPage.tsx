import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useTitle } from '../hooks/useTitle';
import { Skeleton, SkeletonList } from '../components/Skeleton';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import type { RunDetail, Scorecard, Finding } from '../types';
import type { JSX } from 'react';

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

// ── Pipeline steps (for live mode) ───────────────────────────────────

const PIPELINE_STEPS = [
  { id: 'extract', label: 'Extracting content' },
  { id: 'analyze', label: 'Analyzing with personas' },
  { id: 'score', label: 'Computing scores' },
  { id: 'finalize', label: 'Saving results' },
];

// ── Main component ───────────────────────────────────────────────────

export function RunPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi<RunDetail>(id ? `/api/runs/${id}` : null);

  useTitle(data ? `Run ${id?.slice(0, 8)}` : 'Run Detail');

  // Poll every 2s while status is running
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (data?.status === 'running') {
      intervalRef.current = setInterval(reload, 2000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [data?.status, reload]);

  if (loading) {
    return (
      <section className="px-6 py-6">
        <Skeleton className="h-6 w-48 rounded-lg" />
        <div className="mt-6">
          <SkeletonList count={4} className="h-24 w-full rounded-xl" gap="gap-4" />
        </div>
      </section>
    );
  }

  if (error) {
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

  if (data.status === 'running') return <RunningView run={data} />;
  if (data.status === 'failed') return <FailedView run={data} />;
  return <CompletedView run={data} />;
}

// ── Running view ─────────────────────────────────────────────────────

function RunningView({ run }: { run: RunDetail }): JSX.Element {
  // Simulate progress based on elapsed time
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - run.started_at), 500);
    return () => clearInterval(timer);
  }, [run.started_at]);

  const estimatedStepDuration = 8000;
  const currentStepIndex = Math.min(
    Math.floor(elapsed / estimatedStepDuration),
    PIPELINE_STEPS.length - 1,
  );

  return (
    <section className="px-6 py-6">
      <h1 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
        Analyzing...
      </h1>

      <Card className="mt-6">
        <div className="flex flex-col gap-4">
          {PIPELINE_STEPS.map((step, i) => {
            const isCompleted = i < currentStepIndex;
            const isActive = i === currentStepIndex;
            const isPending = i > currentStepIndex;

            return (
              <div key={step.id} className="flex items-center gap-3">
                {isCompleted && (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ECFDF5]">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M3 7l3 3 5-5" stroke="#0E9F6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
                {isActive && (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#4166F5] border-t-transparent" />
                  </span>
                )}
                {isPending && (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#E2E8F0]" />
                  </span>
                )}
                <span className={`text-sm ${isActive ? 'font-semibold text-[#0F172A]' : isCompleted ? 'text-[#64748B]' : 'text-[#94A3B8]'}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </section>
  );
}

// ── Failed view ──────────────────────────────────────────────────────

function FailedView({ run }: { run: RunDetail }): JSX.Element {
  const navigate = useNavigate();
  return (
    <section className="px-6 py-6">
      <h1 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B] mb-4">
        Run Failed
      </h1>
      <div className="rounded-xl border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-3" role="alert">
        <p className="text-sm font-semibold text-[#E02424]">Analysis failed</p>
        <p className="mt-1 text-sm text-[#991B1B]">{run.error ?? 'An unknown error occurred.'}</p>
      </div>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="mt-4 rounded-xl bg-[#4166F5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3354D1]"
      >
        Try Again
      </button>
    </section>
  );
}

// ── Completed view (scorecard) ───────────────────────────────────────

function CompletedView({ run }: { run: RunDetail }): JSX.Element {
  const scorecard = run.scorecards[0];
  if (!scorecard) {
    return (
      <section className="px-6 py-6">
        <EmptyState>No scorecard data available for this run.</EmptyState>
      </section>
    );
  }

  return (
    <section className="px-6 py-6">
      <ScorecardHeader run={run} scorecard={scorecard} />
      <SummarySection summary={scorecard.summary} />
      <CategoryBreakdown findings={scorecard.findings} score={scorecard.overall_score} />
      <FindingsSection findings={scorecard.findings} />
    </section>
  );
}

// ── Header section ───────────────────────────────────────────────────

function ScorecardHeader({ run, scorecard }: { run: RunDetail; scorecard: Scorecard }): JSX.Element {
  const color = scoreColor(scorecard.overall_score);
  const bgColor = scoreBgColor(scorecard.overall_score);
  const relevanceStyle = RELEVANCE_STYLES[scorecard.relevance] ?? RELEVANCE_STYLES.none;

  const duration = run.total_duration_ms
    ? `${(run.total_duration_ms / 1000).toFixed(1)}s`
    : null;

  const dateStr = new Date(run.started_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

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
            <span>
              <a
                href={run.input_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#4166F5] hover:underline"
              >
                {run.input_url.replace(/^https?:\/\//, '').slice(0, 60)}
              </a>
            </span>
          )}
          {duration && <span>Duration: {duration}</span>}
          {run.input_word_count != null && <span>{run.input_word_count.toLocaleString()} words</span>}
          <span>Run by {run.created_by}</span>
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

  // Build category stats; derive per-category score from severity distribution
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

  // Sort by score ascending so worst categories appear first
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

  // Group by severity in order
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
      {/* Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sev.bg} ${sev.text}`}>
          {sev.label}
        </span>
        <span className="rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[11px] font-semibold text-[#64748B]">
          {categoryName}
        </span>
      </div>

      {/* Title */}
      <h4 className="text-sm font-bold text-[#0F172A]">{finding.title}</h4>

      {/* Description */}
      <p className="text-sm text-[#334155] leading-relaxed">{finding.description}</p>

      {/* Evidence */}
      {finding.evidence && (
        <blockquote className="bg-[#F8FAFC] border-l-4 border-[#E2E8F0] pl-4 py-2 text-sm text-[#64748B] italic rounded-r-lg">
          {finding.evidence}
        </blockquote>
      )}

      {/* Recommendation */}
      {finding.recommendation && (
        <div className="bg-[#ECF2FD] border-l-4 border-[#4166F5] pl-4 py-2 text-sm text-[#1E3A5F] rounded-r-lg">
          <span className="font-semibold">Recommendation: </span>
          {finding.recommendation}
        </div>
      )}

      {/* Reasoning */}
      {finding.reasoning && (
        <p className="text-xs text-[#94A3B8] leading-relaxed">{finding.reasoning}</p>
      )}
    </Card>
  );
}
