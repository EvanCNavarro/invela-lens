import { useState, useCallback } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, apiRequest, invalidateCache } from '../hooks/useApi';
import { useTitle } from '../hooks/useTitle';
import { useToast } from '../hooks/useToast';
import { Card } from '../components/Card';
import { Skeleton, SkeletonList } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';

interface Persona {
  id: number;
  name: string;
  title: string;
  archetype: string | null;
  industry: string | null;
}

interface Run {
  id: string;
  input_type: string;
  input_url: string | null;
  status: string;
  started_at: number;
  persona_ids: number[];
}

interface RunsResponse {
  runs: Run[];
  total: number;
}

type InputMode = 'url' | 'text';

const MAX_PERSONAS = 4;

export function AnalysisPage(): JSX.Element {
  useTitle('Analysis');
  const navigate = useNavigate();
  const { toast } = useToast();

  const [inputMode, setInputMode] = useState<InputMode>('url');
  const [inputUrl, setInputUrl] = useState('');
  const [inputText, setInputText] = useState('');
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const { data: personas, loading: personasLoading } = useApi<Persona[]>('/api/personas');
  const { data: recentRuns, loading: runsLoading } = useApi<RunsResponse>('/api/runs?limit=5');

  const togglePersona = useCallback((id: number) => {
    setSelectedPersonaIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_PERSONAS) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const canSubmit =
    !submitting &&
    selectedPersonaIds.size > 0 &&
    ((inputMode === 'url' && inputUrl.trim().length > 0) ||
     (inputMode === 'text' && inputText.trim().length > 0));

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    const result = await apiRequest<{ id: string; status: string }>('/api/runs', {
      method: 'POST',
      json: {
        input_type: inputMode,
        input_url: inputMode === 'url' ? inputUrl.trim() : undefined,
        input_text: inputMode === 'text' ? inputText.trim() : undefined,
        persona_ids: Array.from(selectedPersonaIds),
      },
    });

    setSubmitting(false);

    if (result.ok) {
      invalidateCache('/api/runs');
      navigate(`/runs/${result.value.id}`);
    } else {
      toast({ title: 'Failed to create run', description: result.error.message, variant: 'error' });
    }
  }, [canSubmit, inputMode, inputUrl, inputText, selectedPersonaIds, navigate, toast]);

  return (
    <section className="px-6 py-6">
      <h1 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B]">Analysis</h1>

      {/* Input mode tabs */}
      <div className="mt-6 flex gap-1 rounded-lg bg-[#F1F5F9] p-1 w-fit">
        <TabButton active={inputMode === 'url'} onClick={() => setInputMode('url')}>URL</TabButton>
        <TabButton active={inputMode === 'text'} onClick={() => setInputMode('text')}>Text</TabButton>
      </div>

      {/* Input field */}
      <div className="mt-4">
        {inputMode === 'url' ? (
          <input
            type="url"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="https://example.com/your-page"
            className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#4166F5] focus:outline-none focus:ring-1 focus:ring-[#4166F5]"
          />
        ) : (
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste your content here..."
            rows={6}
            className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#4166F5] focus:outline-none focus:ring-1 focus:ring-[#4166F5] resize-y"
          />
        )}
      </div>

      {/* Persona selector */}
      <div className="mt-6">
        <h2 className="text-[13px] font-semibold text-[#0F172A]">
          Select Personas
          <span className="ml-2 text-[11px] font-normal text-[#94A3B8]">
            {selectedPersonaIds.size}/{MAX_PERSONAS} selected
          </span>
        </h2>

        {personasLoading && (
          <div className="mt-3">
            <SkeletonList
              count={4}
              className="h-16 w-full rounded-xl"
              containerClassName="grid grid-cols-1 gap-3 sm:grid-cols-2"
            />
          </div>
        )}

        {!personasLoading && personas && personas.length === 0 && (
          <div className="mt-3">
            <EmptyState>No personas configured. Create personas first.</EmptyState>
          </div>
        )}

        {!personasLoading && personas && personas.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {personas.map((persona) => {
              const isSelected = selectedPersonaIds.has(persona.id);
              const isDisabled = !isSelected && selectedPersonaIds.size >= MAX_PERSONAS;
              return (
                <PersonaCheckbox
                  key={persona.id}
                  persona={persona}
                  selected={isSelected}
                  disabled={isDisabled}
                  onToggle={() => togglePersona(persona.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Submit button */}
      <div className="mt-6">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="rounded-xl bg-[#4166F5] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#3354D1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4166F5] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {/* Recent runs */}
      <div className="mt-10">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B]">Recent Runs</h2>

        {runsLoading && (
          <div className="mt-4">
            <SkeletonList count={3} className="h-12 w-full rounded-xl" gap="gap-3" />
          </div>
        )}

        {!runsLoading && recentRuns && recentRuns.runs.length === 0 && (
          <div className="mt-4">
            <EmptyState>No runs yet. Analyze a URL or text to get started.</EmptyState>
          </div>
        )}

        {!runsLoading && recentRuns && recentRuns.runs.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            {recentRuns.runs.map((run) => (
              <RunRow key={run.id} run={run} onClick={() => navigate(`/runs/${run.id}`)} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-4 py-1.5 text-[13px] font-medium transition-colors ${
        active
          ? 'bg-white text-[#0F172A] shadow-sm'
          : 'text-[#64748B] hover:text-[#0F172A]'
      }`}
    >
      {children}
    </button>
  );
}

function PersonaCheckbox({
  persona,
  selected,
  disabled,
  onToggle,
}: {
  persona: Persona;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
        selected
          ? 'border-[#4166F5] bg-[#ECF2FD]'
          : disabled
            ? 'border-[#E2E8F0] bg-[#F8FAFC] opacity-50 cursor-not-allowed'
            : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]'
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          selected
            ? 'border-[#4166F5] bg-[#4166F5]'
            : 'border-[#CBD5E1] bg-white'
        }`}
      >
        {selected && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#0F172A]">{persona.name}</p>
        <p className="text-xs text-[#64748B]">{persona.title}</p>
        {persona.archetype && (
          <p className="mt-1 text-xs italic text-[#94A3B8]">"{persona.archetype}"</p>
        )}
      </div>
    </button>
  );
}

const STATUS_STYLES: Record<string, string> = {
  running: 'bg-[#FEF3C7] text-[#D97706]',
  completed: 'bg-[#ECFDF5] text-[#059669]',
  failed: 'bg-[#FEE2E2] text-[#DC2626]',
};

function RunRow({ run, onClick }: { run: Run; onClick: () => void }): JSX.Element {
  const statusStyle = STATUS_STYLES[run.status] ?? 'bg-[#F1F5F9] text-[#64748B]';
  const displayUrl = run.input_url
    ? run.input_url.replace(/^https?:\/\//, '').slice(0, 60)
    : `${run.input_type} input`;
  const timeAgo = formatTimeAgo(run.started_at);

  return (
    <Card
      as="button"
      type="button"
      padding="sm"
      className="flex items-center gap-3 cursor-pointer text-left transition-shadow hover:shadow-md w-full"
      onClick={onClick}
    >
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusStyle}`}>
        {run.status}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-[#0F172A]">{displayUrl}</span>
      <span className="shrink-0 text-xs text-[#94A3B8]">{run.persona_ids.length} persona{run.persona_ids.length !== 1 ? 's' : ''}</span>
      <span className="shrink-0 text-xs text-[#94A3B8]">{timeAgo}</span>
    </Card>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
