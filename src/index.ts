import { handlePersonasList, handlePersonasCreate, handlePersonasUpdate, handlePersonasDelete } from './api/personas';
import { handleRunsCreate, handleRunsGet, handleRunsList } from './api/runs';
import { handleRunsEvents } from './api/runs-events';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return dispatchApi(request, env, ctx, url);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function dispatchApi(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
  const { pathname } = url;
  const method = request.method;

  if (pathname === '/api/health' && method === 'GET') {
    return Response.json({ ok: true });
  }

  if (pathname === '/api/version' && method === 'GET') {
    return Response.json(
      { version: env.BUILD_VERSION ?? 'dev' },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' } },
    );
  }

  if (pathname === '/api/me' && method === 'GET') {
    const name = request.headers.get('x-gateway-user');
    const email = request.headers.get('x-gateway-email');
    if (name) return Response.json({ name, email: email ?? '' });
    return Response.json(null);
  }

  // Runs
  if (pathname === '/api/runs' && method === 'POST') return handleRunsCreate(request, env, ctx);
  if (pathname === '/api/runs' && method === 'GET') return handleRunsList(request, env, url);

  const eventsMatch = pathname.match(/^\/api\/runs\/([A-Za-z0-9]+)\/events$/);
  if (eventsMatch && method === 'GET') return handleRunsEvents(request, env, eventsMatch[1]);

  const runMatch = pathname.match(/^\/api\/runs\/([A-Za-z0-9]+)$/);
  if (runMatch && method === 'GET') return handleRunsGet(request, env, runMatch[1]);

  // Personas CRUD
  if (pathname === '/api/personas' && method === 'GET') return handlePersonasList(request, env);
  if (pathname === '/api/personas' && method === 'POST') return handlePersonasCreate(request, env);

  const personaMatch = pathname.match(/^\/api\/personas\/(\d+)$/);
  if (personaMatch) {
    if (method === 'PUT') return handlePersonasUpdate(request, env, personaMatch[1]);
    if (method === 'DELETE') return handlePersonasDelete(request, env, personaMatch[1]);
  }

  return Response.json({ error: 'not_found', message: 'API route not found' }, { status: 404 });
}
