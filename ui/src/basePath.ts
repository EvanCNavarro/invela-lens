/**
 * Base path prefix for API calls and router basename.
 *
 * When served via the marketing-tools gateway at /apps/persona-lens,
 * Vite injects VITE_BASE_PATH="/apps/persona-lens" at build time.
 * Standalone mode: empty string (no prefix).
 *
 * Usage:
 *   fetch(`${BASE_PATH}/api/runs`)        // API calls
 *   <BrowserRouter basename={BASE_PATH}>  // React Router
 *   new EventSource(`${BASE_PATH}/api/runs/${id}/events`)  // SSE
 */
const raw = import.meta.env.BASE_URL ?? '/';
// Remove trailing slash (Vite adds one) but keep "/" as empty string
export const BASE_PATH = raw === '/' ? '' : raw.replace(/\/$/, '');
