/**
 * ChangelogPage — DRY copy from Logo Finder, adapted for Persona Lens.
 *
 * Fetches from gateway `/api/changelog?app=persona-lens`. Sticky date
 * headers, FAB back-to-top, search highlighting, type filter dropdown.
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTitle } from '../hooks/useTitle';
import { SkeletonList } from '../components/Skeleton';
import { Dropdown } from '../components/Dropdown';

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'feat', label: 'Features' },
  { value: 'fix', label: 'Fixes' },
  { value: 'perf', label: 'Performance' },
  { value: 'refactor', label: 'Refactors' },
] as const;

interface ChangelogEntry {
  id: string;
  date: string;
  app: string;
  type: 'feat' | 'fix' | 'perf' | 'refactor';
  title: string;
  description: string;
  version?: string;
}

const TYPE_STYLES: Record<string, string> = {
  feat: 'bg-[#E7F8F1] text-[#0E9F6E]',
  fix: 'bg-[#FDEAEA] text-[#E02424]',
  perf: 'bg-[#ECF2FD] text-[#4166F5]',
  refactor: 'bg-[#F1F5F9] text-[#64748B]',
};

function highlightText(text: string, query: string): JSX.Element {
  if (!query) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="rounded bg-[#ECF2FD] px-0.5 font-semibold text-[#4166F5]">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export function ChangelogPage() {
  useTitle('Changelog');
  const [data, setData] = useState<ChangelogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFab, setShowFab] = useState(false);

  useEffect(() => {
    fetch('/api/changelog?app=persona-lens')
      .then(r => r.json())
      .then((entries: ChangelogEntry[]) => { setData(entries); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // FAB visibility on scroll
  useEffect(() => {
    function onScroll() {
      setShowFab(window.scrollY > 400);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const filtered = useMemo(() => {
    let entries = data ?? [];
    if (typeFilter) entries = entries.filter(e => e.type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      entries = entries.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
      );
    }
    return entries;
  }, [data, search, typeFilter]);

  const grouped = useMemo(() => {
    const groups: { date: string; entries: ChangelogEntry[] }[] = [];
    let current: { date: string; entries: ChangelogEntry[] } | null = null;
    for (const entry of filtered) {
      if (!current || current.date !== entry.date) {
        current = { date: entry.date, entries: [entry] };
        groups.push(current);
      } else {
        current.entries.push(entry);
      }
    }
    return groups;
  }, [filtered]);

  return (
    <section className="px-6 py-6">
      <h1 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B] mb-4">
        Changelog
      </h1>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search changes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="min-w-[200px] flex-1 rounded-lg border border-[#E2E8F0] bg-white px-[14px] py-[10px] text-[13px] text-[#0F172A] placeholder-[#94A3B8]"
        />
        <div className="flex items-center gap-[6px] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-[14px] py-[10px] text-[13px] font-medium text-[#64748B] cursor-default select-none">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Persona Lens
        </div>
        <Dropdown label="" options={TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter} />
      </div>

      {loading ? (
        <SkeletonList count={6} className="h-20 rounded-xl" gap="gap-3" />
      ) : error ? (
        <p className="text-sm text-[#E02424]">Failed to load changelog.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[#94A3B8]">No changes match your filters.</p>
      ) : (
        <div className="rounded-xl border border-[#E2E8F0] bg-white">
          {grouped.map(group => (
            <div key={group.date}>
              <div className="sticky top-0 z-10 px-5 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0] text-[12px] font-bold uppercase tracking-[0.1em] text-[#64748B]">
                {group.date}
              </div>
              {group.entries.map(entry => (
                <div key={entry.id} className="px-5 py-4 border-b border-[#E2E8F0] last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${TYPE_STYLES[entry.type] ?? TYPE_STYLES.refactor}`}>
                        {entry.type}
                      </span>
                      {entry.version && (
                        <span className="text-[11px] font-medium text-[#94A3B8]">v{entry.version}</span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#94A3B8] shrink-0">{entry.date}</span>
                  </div>
                  <h3 className="mt-2 text-[15px] font-bold text-[#0F172A]">{highlightText(entry.title, search)}</h3>
                  <p className="mt-1 text-[13px] text-[#64748B]">{highlightText(entry.description, search)}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* FAB back-to-top */}
      {showFab && (
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="Back to top"
          className="fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E8F0] bg-white shadow-lg transition-colors hover:bg-[#F1F5F9]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-[#64748B]">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}
    </section>
  );
}
