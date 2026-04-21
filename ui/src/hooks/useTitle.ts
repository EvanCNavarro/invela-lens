import { useEffect } from 'react';

/** Set the document title. Pattern: "{page} · Marketing Tools" */
export function useTitle(page: string) {
  useEffect(() => {
    document.title = `${page} · Marketing Tools`;
    return () => { document.title = 'Marketing Tools'; };
  }, [page]);
}
