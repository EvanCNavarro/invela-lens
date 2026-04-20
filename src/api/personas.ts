export async function handlePersonasList(_request: Request, env: Env): Promise<Response> {
  const rows = await env.DB.prepare('SELECT * FROM personas ORDER BY name').all();
  return Response.json(rows.results);
}

export async function handlePersonasCreate(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as Record<string, unknown>;
  const createdBy = request.headers.get('x-gateway-user') ?? 'anonymous';
  const now = Date.now();

  const result = await env.DB.prepare(
    `INSERT INTO personas (name, title, archetype, industry, description, responsibilities, concerns, quotes, decision_criteria, created_by, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
  ).bind(
    body.name,
    body.title,
    (body.archetype as string) ?? null,
    (body.industry as string) ?? null,
    body.description,
    (body.responsibilities as string) ?? null,
    JSON.stringify((body.concerns as unknown[]) ?? []),
    JSON.stringify((body.quotes as unknown[]) ?? []),
    JSON.stringify((body.decision_criteria as unknown[]) ?? []),
    createdBy,
    now,
    now,
  ).run();

  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
}

export async function handlePersonasUpdate(request: Request, env: Env, id: string): Promise<Response> {
  const body = (await request.json()) as Record<string, unknown>;
  const now = Date.now();

  await env.DB.prepare(
    `UPDATE personas SET name=?1, title=?2, archetype=?3, industry=?4, description=?5, responsibilities=?6, concerns=?7, quotes=?8, decision_criteria=?9, updated_at=?10 WHERE id=?11`,
  ).bind(
    body.name,
    body.title,
    (body.archetype as string) ?? null,
    (body.industry as string) ?? null,
    body.description,
    (body.responsibilities as string) ?? null,
    JSON.stringify((body.concerns as unknown[]) ?? []),
    JSON.stringify((body.quotes as unknown[]) ?? []),
    JSON.stringify((body.decision_criteria as unknown[]) ?? []),
    now,
    parseInt(id),
  ).run();

  return Response.json({ ok: true });
}

export async function handlePersonasDelete(_request: Request, env: Env, id: string): Promise<Response> {
  await env.DB.prepare('DELETE FROM personas WHERE id = ?1').bind(parseInt(id)).run();
  return Response.json({ ok: true });
}
