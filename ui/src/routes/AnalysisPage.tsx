import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { JSX, DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApi, apiRequest, invalidateCache } from '../hooks/useApi';
import { BASE_PATH } from '../basePath';
import { useTitle } from '../hooks/useTitle';
import { useToast } from '../hooks/useToast';
import { Card } from '../components/Card';
import { SkeletonList } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { formatFileSize } from '../lib/format';

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

type InputMode = 'url' | 'text' | 'file';

const MAX_FILE_SIZE = 20 * 1024 * 1024;

// Group display names and order for persona industries
const GROUP_ORDER = [
  'Financial Institution',
  'Aggregator',
  'Third Party Provider',
  'Consumer',
  'Investor',
  'Regulator',
  'Industry Body',
  'Standards Organization',
  'Cybersecurity',
  'Academic',
];

const GROUP_LABELS: Record<string, string> = {
  'Financial Institution': 'Account Provider (FI)',
  'Aggregator': 'Access Aggregator',
  'Third Party Provider': 'Third Party Provider (TPP)',
};

function groupLabel(industry: string): string {
  return GROUP_LABELS[industry] ?? industry;
}

interface PersonaGroup {
  industry: string;
  label: string;
  personas: Persona[];
}
const ACCEPTED_TYPES = '.pdf,.docx,.doc,.html,.htm,.txt,.md,.rtf';

function isUrl(text: string): boolean {
  const trimmed = text.trim();
  return /^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed);
}

export function AnalysisPage(): JSX.Element {
  useTitle('Analysis');
  const navigate = useNavigate();
  const { toast } = useToast();

  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as InputMode) ?? 'url';
  const [inputMode, setInputMode] = useState<InputMode>(initialTab);
  const [inputUrl, setInputUrl] = useState('');
  const [inputText, setInputText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragCountRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: personas, loading: personasLoading } = useApi<Persona[]>('/api/personas');
  const { data: recentRuns, loading: runsLoading } = useApi<RunsResponse>('/api/runs?limit=5');

  // Group personas by industry
  const personaGroups = useMemo((): PersonaGroup[] => {
    if (!personas) return [];
    const map = new Map<string, Persona[]>();
    for (const p of personas) {
      const key = p.industry ?? 'Other';
      const group = map.get(key) ?? [];
      group.push(p);
      map.set(key, group);
    }
    // Sort groups by GROUP_ORDER, unknown groups at end
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        const ai = GROUP_ORDER.indexOf(a);
        const bi = GROUP_ORDER.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
      .map(([industry, groupPersonas]) => ({
        industry,
        label: groupLabel(industry),
        personas: groupPersonas.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [personas]);

  const togglePersona = useCallback((id: number) => {
    setSelectedPersonaIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((groupPersonas: Persona[]) => {
    setSelectedPersonaIds(prev => {
      const next = new Set(prev);
      const groupIds = groupPersonas.map(p => p.id);
      const allSelected = groupIds.every(id => next.has(id));
      if (allSelected) {
        groupIds.forEach(id => next.delete(id));
      } else {
        groupIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, []);

  // ── Drag-and-drop ──────────────────────────────────────────────────
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCountRef.current++;
    if (dragCountRef.current === 1) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCountRef.current--;
    if (dragCountRef.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCountRef.current = 0;
    setDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      if (droppedFile.size > MAX_FILE_SIZE) {
        toast({ title: 'File too large', description: 'Maximum file size is 20MB', variant: 'error' });
        return;
      }
      setFile(droppedFile);
      setInputMode('file');
    }
  }, [toast]);

  // ── Smart paste detection ──────────────────────────────────────────
  useEffect(() => {
    function handlePaste(e: globalThis.ClipboardEvent) {
      // Only intercept if no input/textarea is focused, or if we're in the textarea
      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      // Check for pasted files (images, PDFs)
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of Array.from(items)) {
          if (item.kind === 'file') {
            e.preventDefault();
            const pastedFile = item.getAsFile();
            if (pastedFile) {
              if (pastedFile.size > MAX_FILE_SIZE) {
                toast({ title: 'File too large', description: 'Maximum file size is 20MB', variant: 'error' });
                return;
              }
              setFile(pastedFile);
              setInputMode('file');
              return;
            }
          }
        }
      }

      // Check for pasted text — only auto-detect if we're not already typing in a field
      if (!isInputFocused) {
        const text = e.clipboardData?.getData('text/plain') ?? '';
        if (text) {
          e.preventDefault();
          if (isUrl(text)) {
            setInputUrl(text.trim().startsWith('http') ? text.trim() : `https://${text.trim()}`);
            setInputMode('url');
          } else {
            setInputText(text);
            setInputMode('text');
          }
        }
      }
    }

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [toast]);

  // ── File picker ────────────────────────────────────────────────────
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (selected.size > MAX_FILE_SIZE) {
        toast({ title: 'File too large', description: 'Maximum file size is 20MB', variant: 'error' });
        return;
      }
      setFile(selected);
    }
  }, [toast]);

  const clearFile = useCallback(() => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────
  const canSubmit =
    !submitting &&
    selectedPersonaIds.size > 0 &&
    ((inputMode === 'url' && inputUrl.trim().length > 0) ||
     (inputMode === 'text' && inputText.trim().length > 0) ||
     (inputMode === 'file' && file !== null));

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    let r2Key: string | undefined;
    let filename: string | undefined;

    // If file mode, upload first
    if (inputMode === 'file' && file) {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch(`${BASE_PATH}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) {
        setSubmitting(false);
        toast({ title: 'Upload failed', description: 'Could not upload file', variant: 'error' });
        return;
      }
      const uploadData = await uploadRes.json() as { key: string; filename: string };
      r2Key = uploadData.key;
      filename = uploadData.filename;
    }

    const result = await apiRequest<{ id: string; status: string }>('/api/runs', {
      method: 'POST',
      json: {
        input_type: inputMode,
        input_url: inputMode === 'url' ? (inputUrl.trim().match(/^https?:\/\//i) ? inputUrl.trim() : `https://${inputUrl.trim()}`) : undefined,
        input_text: inputMode === 'text' ? inputText.trim() : undefined,
        input_r2_key: r2Key,
        input_filename: filename,
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
  }, [canSubmit, inputMode, inputUrl, inputText, file, selectedPersonaIds, navigate, toast]);

  return (
    <section
      className="px-6 py-6 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Submitting overlay — POST blocks while pipeline runs */}
      {submitting && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-white/80 backdrop-blur-sm">
          <span className="h-8 w-8 animate-spin rounded-full border-3 border-[#4166F5] border-t-transparent" />
          <p className="mt-3 text-sm font-semibold text-[#0F172A]">Analyzing...</p>
          <p className="mt-1 text-xs text-[#64748B]">This may take 20-60 seconds</p>
        </div>
      )}

      {/* Drag overlay */}
      {dragging && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-[#4166F5] bg-[#ECF2FD]/80 backdrop-blur-sm">
          <div className="text-center">
            <UploadIcon />
            <p className="mt-2 text-sm font-semibold text-[#4166F5]">Drop file to analyze</p>
            <p className="mt-1 text-xs text-[#64748B]">PDF, DOCX, HTML, TXT</p>
          </div>
        </div>
      )}

      <h1 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B]">Analysis</h1>

      {/* Input mode tabs */}
      <div className="mt-6 flex gap-1 rounded-lg bg-[#F1F5F9] p-1 w-fit">
        <TabButton active={inputMode === 'url'} onClick={() => setInputMode('url')}>URL</TabButton>
        <TabButton active={inputMode === 'text'} onClick={() => setInputMode('text')}>Text</TabButton>
        <TabButton active={inputMode === 'file'} onClick={() => setInputMode('file')}>File</TabButton>
      </div>

      {/* Input field */}
      <div className="mt-4">
        {inputMode === 'url' && (
          <input
            type="url"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="https://example.com/your-page"
            className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#4166F5] focus:outline-none focus:ring-1 focus:ring-[#4166F5]"
          />
        )}

        {inputMode === 'text' && (
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste your content here..."
            rows={6}
            className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#4166F5] focus:outline-none focus:ring-1 focus:ring-[#4166F5] resize-y"
          />
        )}

        {inputMode === 'file' && (
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
            {file ? (
              <div className="flex items-center gap-3">
                <FileIcon />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#0F172A]">{file.name}</p>
                  <p className="text-xs text-[#94A3B8]">{formatFileSize(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  className="rounded-lg p-1.5 text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#64748B]"
                  aria-label="Remove file"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            ) : (
              <div className="text-center">
                <UploadIcon />
                <p className="mt-2 text-sm text-[#64748B]">
                  Drag & drop a file, or{' '}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="font-semibold text-[#4166F5] hover:underline"
                  >
                    browse
                  </button>
                </p>
                <p className="mt-1 text-xs text-[#94A3B8]">PDF, DOCX, HTML, TXT — up to 20MB</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}
      </div>

      {/* Persona selector */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold text-[#0F172A]">
            Select Personas
            <span className="ml-2 text-[11px] font-normal text-[#94A3B8]">
              {selectedPersonaIds.size} selected
            </span>
          </h2>
          {selectedPersonaIds.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedPersonaIds(new Set())}
              className="text-[11px] font-medium text-[#4166F5] hover:underline"
            >
              Clear all
            </button>
          )}
        </div>

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

        {!personasLoading && personaGroups.length > 0 && (
          <div className="mt-3 flex flex-col gap-5">
            {personaGroups.map((group) => {
              const groupIds = group.personas.map(p => p.id);
              const selectedCount = groupIds.filter(id => selectedPersonaIds.has(id)).length;
              const allSelected = selectedCount === groupIds.length;

              return (
                <div key={group.industry}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#94A3B8]">
                      {group.label}
                      <span className="ml-1.5 font-normal">({group.personas.length})</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.personas)}
                      className="text-[11px] font-medium text-[#4166F5] hover:underline"
                    >
                      {allSelected ? 'Deselect all' : selectedCount > 0 ? 'Select rest' : 'Select all'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {group.personas.map((persona) => (
                      <PersonaCheckbox
                        key={persona.id}
                        persona={persona}
                        selected={selectedPersonaIds.has(persona.id)}
                        disabled={false}
                        onToggle={() => togglePersona(persona.id)}
                      />
                    ))}
                  </div>
                </div>
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

// ── Sub-components ──────────────────────────────────────────────────────

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

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto h-8 w-8 text-[#94A3B8]">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 shrink-0 text-[#4166F5]">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
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
