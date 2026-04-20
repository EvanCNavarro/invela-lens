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
  _ctx: ExecutionContext,
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

  return Response.json({ error: 'not_found', message: 'API route not found' }, { status: 404 });
}
