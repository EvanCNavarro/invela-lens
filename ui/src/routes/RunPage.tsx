import { useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useTitle } from '../hooks/useTitle';
import { Skeleton } from '../components/Skeleton';
import type { JSX } from 'react';

export function RunPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  useTitle('Run Detail');
  const { data, loading, error } = useApi<unknown>(id ? `/api/runs/${id}` : null);

  if (loading) return <section className="px-6 py-6"><Skeleton className="h-40 rounded-xl" /></section>;
  if (error) return <section className="px-6 py-6"><p className="text-sm text-[#E02424]">Failed to load run.</p></section>;

  return (
    <section className="px-6 py-6">
      <h1 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B] mb-4">Run Detail</h1>
      <pre className="text-xs bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0] overflow-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </section>
  );
}
