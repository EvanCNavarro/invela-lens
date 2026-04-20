import { useState, useCallback } from 'react';
import type { JSX } from 'react';
import { useApi, apiRequest, invalidateCache } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { Card } from '../components/Card';
import { SkeletonList } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { PersonaFormModal } from './PersonaFormModal';

interface Persona {
  id: number;
  name: string;
  title: string;
  archetype: string | null;
  industry: string | null;
  description: string;
  responsibilities: string | null;
  concerns: string;
  quotes: string | null;
  decision_criteria: string | null;
  created_by: string;
  created_at: number;
  updated_at: number;
}

function parseConcerns(raw: string): string[] {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

const INDUSTRY_COLORS: Record<string, string> = {
  'Financial Institutions': 'bg-[#ECF2FD] text-[#4166F5]',
  'Aggregators': 'bg-[#ECFDF5] text-[#059669]',
  'Third-Party Providers': 'bg-[#FFF7ED] text-[#D97706]',
};

function IndustryPill({ industry }: { industry: string }): JSX.Element {
  const colors = INDUSTRY_COLORS[industry] ?? 'bg-[#F1F5F9] text-[#64748B]';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${colors}`}>
      {industry}
    </span>
  );
}

export function PersonasPage(): JSX.Element {
  const { data: personas, loading, error, reload } = useApi<Persona[]>('/api/personas');
  const { toast } = useToast();
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleSaved = useCallback(() => {
    invalidateCache('/api/personas');
    reload();
    setEditingPersona(null);
    setIsCreating(false);
    toast({ title: 'Persona saved', variant: 'success' });
  }, [reload, toast]);

  const handleDelete = useCallback(async (id: number) => {
    const result = await apiRequest('/api/personas/' + id, { method: 'DELETE' });
    if (result.ok) {
      invalidateCache('/api/personas');
      reload();
      toast({ title: 'Persona deleted', variant: 'success' });
    } else {
      toast({ title: 'Delete failed', description: result.error.message, variant: 'error' });
    }
  }, [reload, toast]);

  const handleClose = useCallback(() => {
    setEditingPersona(null);
    setIsCreating(false);
  }, []);

  return (
    <section className="px-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B]">Personas</h1>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-[13px] font-medium text-[#0F172A] transition-colors hover:border-[#4166F5] hover:bg-[#ECF2FD] hover:text-[#4166F5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4166F5]"
        >
          + New Persona
        </button>
      </div>

      {loading && (
        <div className="mt-6">
          <SkeletonList
            count={6}
            className="h-40 w-full rounded-xl"
            containerClassName="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          />
        </div>
      )}

      {error && (
        <div className="mt-6">
          <EmptyState tone="error">Failed to load personas: {error.message ?? error.error}</EmptyState>
        </div>
      )}

      {!loading && !error && personas && personas.length === 0 && (
        <div className="mt-6">
          <EmptyState>No personas yet. Create one to get started.</EmptyState>
        </div>
      )}

      {!loading && personas && personas.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((persona) => {
            const concerns = parseConcerns(persona.concerns);
            return (
              <Card
                key={persona.id}
                as="button"
                type="button"
                padding="md"
                className="cursor-pointer text-left transition-shadow hover:shadow-md"
                onClick={() => setEditingPersona(persona)}
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-bold text-[#0F172A]">{persona.name}</h2>
                  <button
                    type="button"
                    aria-label={`Delete ${persona.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(persona.id);
                    }}
                    className="shrink-0 rounded-md p-1 text-[#94A3B8] transition-colors hover:bg-red-50 hover:text-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <p className="mt-1 text-xs text-[#64748B]">{persona.title}</p>
                {persona.archetype && (
                  <p className="mt-2 text-xs italic text-[#94A3B8]">"{persona.archetype}"</p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  {persona.industry && <IndustryPill industry={persona.industry} />}
                  {concerns.length > 0 && (
                    <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-semibold text-[#64748B]">
                      {concerns.length} concern{concerns.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {(isCreating || editingPersona !== null) && (
        <PersonaFormModal
          persona={editingPersona}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
    </section>
  );
}
