import { useEffect } from 'react';

/** Set the document title. Pattern: "{page} · Persona Lens" */
export function useTitle(page: string) {
  useEffect(() => {
    document.title = `${page} · Persona Lens`;
    return () => { document.title = 'Persona Lens'; };
  }, [page]);
}
