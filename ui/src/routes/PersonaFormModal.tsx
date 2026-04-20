import { useState } from 'react';
import type { FormEvent, JSX } from 'react';
import { apiRequest } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { Card } from '../components/Card';

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
}

interface PersonaFormModalProps {
  persona: Persona | null;
  onClose: () => void;
  onSaved: () => void;
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function linesToArray(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

const LABEL_CLASSES = 'block text-[11px] font-bold uppercase tracking-[0.1em] text-[#64748B] mb-1.5';
const INPUT_CLASSES = 'w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px] text-[#0F172A] placeholder:text-[#94A3B8] transition-[border-color,box-shadow] duration-[120ms] focus:border-[#4166F5] focus:shadow-[0_0_0_3px_rgba(65,102,245,0.1)] focus:outline-none';

export function PersonaFormModal({ persona, onClose, onSaved }: PersonaFormModalProps): JSX.Element {
  const isEditing = persona !== null;
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(persona?.name ?? '');
  const [title, setTitle] = useState(persona?.title ?? '');
  const [archetype, setArchetype] = useState(persona?.archetype ?? '');
  const [industry, setIndustry] = useState(persona?.industry ?? '');
  const [description, setDescription] = useState(persona?.description ?? '');
  const [responsibilities, setResponsibilities] = useState(persona?.responsibilities ?? '');
  const [concerns, setConcerns] = useState(parseJsonArray(persona?.concerns ?? null).join('\n'));
  const [quotes, setQuotes] = useState(parseJsonArray(persona?.quotes ?? null).join('\n'));
  const [decisionCriteria, setDecisionCriteria] = useState(parseJsonArray(persona?.decision_criteria ?? null).join('\n'));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);

    const body = {
      name,
      title,
      archetype: archetype || null,
      industry: industry || null,
      description,
      responsibilities: responsibilities || null,
      concerns: linesToArray(concerns),
      quotes: linesToArray(quotes),
      decision_criteria: linesToArray(decisionCriteria),
    };

    const result = isEditing
      ? await apiRequest('/api/personas/' + persona.id, { method: 'PUT', json: body })
      : await apiRequest('/api/personas', { method: 'POST', json: body });

    setSaving(false);

    if (result.ok) {
      onSaved();
    } else {
      toast({ title: 'Save failed', description: result.error.message, variant: 'error' });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? `Edit ${persona.name}` : 'New Persona'}
    >
      <Card variant="modal" padding="lg" className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-sm font-bold text-[#0F172A]">
          {isEditing ? 'Edit Persona' : 'New Persona'}
        </h2>
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <div>
            <label className={LABEL_CLASSES}>Name</label>
            <input className={INPUT_CLASSES} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className={LABEL_CLASSES}>Title</label>
            <input className={INPUT_CLASSES} value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASSES}>Archetype</label>
              <input className={INPUT_CLASSES} value={archetype} onChange={(e) => setArchetype(e.target.value)} placeholder="e.g. The Sentinel" />
            </div>
            <div>
              <label className={LABEL_CLASSES}>Industry</label>
              <input className={INPUT_CLASSES} value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Financial Institutions" />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASSES}>Description</label>
            <textarea className={`${INPUT_CLASSES} min-h-[72px] resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          <div>
            <label className={LABEL_CLASSES}>Responsibilities</label>
            <input className={INPUT_CLASSES} value={responsibilities} onChange={(e) => setResponsibilities(e.target.value)} />
          </div>
          <div>
            <label className={LABEL_CLASSES}>Concerns (one per line)</label>
            <textarea className={`${INPUT_CLASSES} min-h-[72px] resize-y`} value={concerns} onChange={(e) => setConcerns(e.target.value)} placeholder="One concern per line" />
          </div>
          <div>
            <label className={LABEL_CLASSES}>Quotes (one per line)</label>
            <textarea className={`${INPUT_CLASSES} min-h-[72px] resize-y`} value={quotes} onChange={(e) => setQuotes(e.target.value)} placeholder="One quote per line" />
          </div>
          <div>
            <label className={LABEL_CLASSES}>Decision Criteria (one per line)</label>
            <textarea className={`${INPUT_CLASSES} min-h-[72px] resize-y`} value={decisionCriteria} onChange={(e) => setDecisionCriteria(e.target.value)} placeholder="One criterion per line" />
          </div>

          <div className="mt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[13px] font-medium text-[#64748B] transition-colors hover:bg-[#F8FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4166F5]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#4166F5] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#3355DD] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4166F5]"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
