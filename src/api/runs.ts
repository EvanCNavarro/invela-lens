import { ulid } from '../lib/ulid';
import { runPipeline } from '../pipeline/orchestrator';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function handleUpload(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) {
    return Response.json({ error: 'validation_error', message: 'file field required' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: 'validation_error', message: 'File too large (max 20MB)' }, { status: 400 });
  }

  // Sanitize filename to prevent path traversal
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  const key = `uploads/${ulid()}-${safeName}`;
  await env.UPLOADS.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { originalName: file.name },
  });

  return Response.json({ key, filename: file.name, size: file.size });
}

export async function handleRunsCreate(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await request.json() as {
    input_type: 'url' | 'text' | 'file';
    input_url?: string;
    input_text?: string;
    input_r2_key?: string;
    input_filename?: string;
    persona_ids: number[];
  };

  if (!body.input_type || !body.persona_ids?.length) {
    return Response.json({ error: 'validation_error', message: 'input_type and persona_ids required' }, { status: 400 });
  }

  if (body.input_type === 'url' && !body.input_url) {
    return Response.json({ error: 'validation_error', message: 'input_url required for URL analysis' }, { status: 400 });
  }

  if (body.input_type === 'file' && !body.input_r2_key) {
    return Response.json({ error: 'validation_error', message: 'input_r2_key required for file analysis' }, { status: 400 });
  }

  const id = ulid();
  const createdBy = request.headers.get('x-gateway-user') ?? 'anonymous';
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO runs (id, input_type, input_url, input_text, input_filename, input_r2_key, persona_ids, status, started_at, created_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'running', ?8, ?9)`
  ).bind(
    id,
    body.input_type,
    body.input_url ?? null,
    body.input_text ?? null,
    body.input_filename ?? null,
    body.input_r2_key ?? null,
    JSON.stringify(body.persona_ids),
    now,
    createdBy,
  ).run();

  // Run pipeline inline — Worker stays alive for the full request duration.
  // POST blocks until complete (~30-60s), client navigates after response.
  await runPipeline(env, {
    id,
    input_type: body.input_type,
    input_url: body.input_url ?? null,
    input_text: body.input_text ?? null,
    input_r2_key: body.input_r2_key ?? null,
    input_filename: body.input_filename ?? null,
    persona_ids: JSON.stringify(body.persona_ids),
  });

  const finalRun = await env.DB.prepare('SELECT status FROM runs WHERE id = ?1').bind(id).first<{status: string}>();
  return Response.json({ id, status: finalRun?.status ?? 'completed' }, { status: 201 });
}

const STALE_RUN_MS = 5 * 60 * 1000; // 5 minutes

/** Mark runs stuck in 'running' for >5min as failed. Runs on every read. */
async function reapStaleRuns(env: Env): Promise<void> {
  const cutoff = Date.now() - STALE_RUN_MS;
  await env.DB.prepare(
    `UPDATE runs SET status = 'failed', error = 'Pipeline timed out', completed_at = ?1
     WHERE status = 'running' AND started_at < ?2`
  ).bind(Date.now(), cutoff).run();
}

export async function handleRunsGet(_request: Request, env: Env, id: string): Promise<Response> {
  await reapStaleRuns(env);
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
  await reapStaleRuns(env);
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

  // Enrich each run with scorecard summaries (persona name + score)
  const enriched = await Promise.all(
    (runs.results ?? []).map(async (r: Record<string, unknown>) => {
      const scorecards = await env.DB.prepare(
        `SELECT s.overall_score, s.relevance, p.name as persona_name,
                (SELECT COUNT(*) FROM findings f WHERE f.scorecard_id = s.id) as finding_count
         FROM scorecards s JOIN personas p ON s.persona_id = p.id
         WHERE s.run_id = ?1`
      ).bind(r.id).all();

      return {
        ...r,
        persona_ids: JSON.parse(r.persona_ids as string ?? '[]'),
        scorecards: scorecards.results ?? [],
      };
    })
  );

  return Response.json({ runs: enriched, total: count?.total ?? 0 });
}
