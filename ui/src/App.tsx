import { BrowserRouter, Route, Routes, Link } from 'react-router-dom';
import type { JSX } from 'react';
// Import DRY components
import { NavigationProgress } from './components/NavigationProgress';
import { ToastProvider } from './components/ToastProvider';
import { ToastViewport } from './components/ToastViewport';
import { VersionChecker } from './components/VersionChecker';
import { useIsRevalidating } from './hooks/useApi';
import { EmptyState } from './components/EmptyState';
import { BASE_PATH } from './basePath';

// Placeholder pages
function AnalysisPage() { return <section className="px-6 py-6"><h1 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B]">Analysis</h1><p className="mt-4 text-sm text-[#64748B]">Coming soon — upload a URL or file to analyze.</p></section>; }
function HistoryPage() { return <section className="px-6 py-6"><h1 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B]">Run History</h1></section>; }
function PersonasPage() { return <section className="px-6 py-6"><h1 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B]">Personas</h1></section>; }
function ChangelogPage() { return <section className="px-6 py-6"><h1 className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#64748B]">Changelog</h1></section>; }

export function App() {
  const revalidating = useIsRevalidating();
  return (
    <ToastProvider>
      <VersionChecker />
      <BrowserRouter basename={BASE_PATH || undefined}>
        <NavigationProgress active={revalidating} />
        <main className="mx-auto max-w-[1120px]">
          <Routes>
            <Route path="/" element={<AnalysisPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/personas" element={<PersonasPage />} />
            <Route path="/changelog" element={<ChangelogPage />} />
            <Route path="*" element={<NotFoundRoute />} />
          </Routes>
        </main>
      </BrowserRouter>
      <ToastViewport />
    </ToastProvider>
  );
}

function NotFoundRoute(): JSX.Element {
  return (
    <section className="px-6 py-10">
      <EmptyState>That page doesn't exist.</EmptyState>
      <p className="mt-3 text-sm">
        <Link to="/" className="text-[#4166F5] hover:underline">← Back to analysis</Link>
      </p>
    </section>
  );
}
