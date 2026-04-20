import { ulid } from '../lib/ulid';
import { runPipeline } from '../pipeline/orchestrator';

export async function handleRunsCreate(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await request.json() as {
    input_type: 'url' | 'text';
    input_url?: string;
    input_text?: string;
    persona_ids: number[];
  };

  if (!body.input_type || !body.persona_ids?.length) {
    return Response.json({ error: 'validation_error', message: 'input_type and persona_ids required' }, { status: 400 });
  }

  if (body.input_type === 'url' && !body.input_url) {
    return Response.json({ error: 'validation_error', message: 'input_url required for URL analysis' }, { status: 400 });
  }

  const id = ulid();
  const createdBy = request.headers.get('x-gateway-user') ?? 'anonymous';
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO runs (id, input_type, input_url, persona_ids, status, started_at, created_by)
     VALUES (?1, ?2, ?3, ?4, 'running', ?5, ?6)`
  ).bind(id, body.input_type, body.input_url ?? null, JSON.stringify(body.persona_ids), now, createdBy).run();

  // Launch pipeline in background
  ctx.waitUntil(
    runPipeline(env, {
      id,
      input_type: body.input_type,
      input_url: body.input_url ?? null,
      input_text: body.input_text ?? null,
      persona_ids: JSON.stringify(body.persona_ids),
    }),
  );

  return Response.json({ id, status: 'running' }, { status: 201 });
}

export async function handleRunsGet(_request: Request, env: Env, id: string): Promise<Response> {
  const run = await env.DB.prepare('SELECT * FROM runs WHERE id = ?1').bind(id).first();
  if (!run) return Response.json({ error: 'not_found', message: 'Run not found' }, { status: 404 });

  const scorecards = await env.DB.prepare(
    `SELECT s.*, p.name as persona_name, p.archetype as persona_archetype
     FROM scorecards s JOIN personas p ON s.persona_id = p.id
     WHERE s.run_id = ?1`
  ).bind(id).all();

  const findings = await env.DB.prepare(
    'SELECT * FROM findings WHERE scorecard_id IN (SELECT id FROM scorecards WHERE run_id = ?1) ORDER BY scorecard_id, CASE severity WHEN "critical" THEN 0 WHEN "high" THEN 1 WHEN "medium" THEN 2 WHEN "low" THEN 3 END'
  ).bind(id).all();

  return Response.json({
    ...run,
    persona_ids: JSON.parse((run as Record<string, unknown>).persona_ids as string ?? '[]'),
    scorecards: scorecards.results?.map((s: Record<string, unknown>) => ({
      ...s,
      findings: findings.results?.filter((f: Record<string, unknown>) => f.scorecard_id === s.id) ?? []
    })) ?? []
  });
}

export async function handleRunsList(_request: Request, env: Env, url: URL): Promise<Response> {
  const limit = parseInt(url.searchParams.get('limit') ?? '50');
  const offset = parseInt(url.searchParams.get('offset') ?? '0');
  const status = url.searchParams.get('status');

  let query = 'SELECT * FROM runs';
  const params: (string | number)[] = [];

  if (status) {
    query += ' WHERE status = ?1';
    params.push(status);
  }

  query += ' ORDER BY started_at DESC LIMIT ?' + (params.length + 1) + ' OFFSET ?' + (params.length + 2);
  params.push(limit, offset);

  const countQuery = status ? 'SELECT COUNT(*) as total FROM runs WHERE status = ?1' : 'SELECT COUNT(*) as total FROM runs';
  const countParams = status ? [status] : [];

  const [runs, count] = await Promise.all([
    env.DB.prepare(query).bind(...params).all(),
    env.DB.prepare(countQuery).bind(...countParams).first<{ total: number }>()
  ]);

  return Response.json({
    runs: runs.results?.map((r: Record<string, unknown>) => ({ ...r, persona_ids: JSON.parse(r.persona_ids as string ?? '[]') })) ?? [],
    total: count?.total ?? 0
  });
}
