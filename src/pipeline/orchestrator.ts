import { extractContent } from './extract';
import { analyzeWithPersona } from './analyze';

interface RunRecord {
  id: string;
  input_type: string;
  input_url: string | null;
  input_text: string | null;
  persona_ids: string; // JSON array
}

export async function runPipeline(env: Env, run: RunRecord): Promise<void> {
  const db = env.DB;
  const runId = run.id;
  let seq = 0;

  async function emitEvent(eventType: string, stepId: string | null, payload: Record<string, unknown>) {
    seq++;
    await db
      .prepare(
        'INSERT INTO audit (run_id, seq, event_type, step_id, payload_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
      )
      .bind(runId, seq, eventType, stepId, JSON.stringify(payload), Date.now())
      .run();
  }

  try {
    const personaIds: number[] = JSON.parse(run.persona_ids);
    await emitEvent('pipeline.started', null, { persona_ids: personaIds, content_source: run.input_url });

    // Step 1: Extract content
    await emitEvent('step.started', 'fetch', { label: 'Fetching content...' });

    const extraction = await extractContent(
      env,
      run.input_type as 'url' | 'text',
      run.input_url,
      run.input_text,
    );

    await db.prepare('UPDATE runs SET input_word_count = ?1 WHERE id = ?2').bind(extraction.wordCount, runId).run();
    await emitEvent('step.completed', 'fetch', {
      label: `Content extracted (${extraction.wordCount} words)`,
      truncated: extraction.truncated,
    });

    // Step 2: Analyze with each persona in parallel
    const personas = await db
      .prepare(`SELECT * FROM personas WHERE id IN (${personaIds.map(() => '?').join(',')})`)
      .bind(...personaIds)
      .all();

    if (!personas.results?.length) {
      throw new Error('No matching personas found');
    }

    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    // Emit start events for all persona analyses
    for (const p of personas.results) {
      const persona = p as Record<string, unknown>;
      await emitEvent('step.started', `analyze:${persona.id}`, { label: `Analyzing as ${persona.name}...` });
    }

    // Run all persona analyses in parallel
    const results = await Promise.all(
      personas.results.map(async (p) => {
        const persona = p as Record<string, unknown>;
        try {
          const scorecard = await analyzeWithPersona(
            apiKey,
            persona as unknown as Parameters<typeof analyzeWithPersona>[1],
            extraction.markdown,
            run.input_url ?? 'pasted text',
            extraction.wordCount,
          );
          const findingCount = scorecard.categories.reduce((s, c) => s + c.findings.length, 0);
          await emitEvent('step.completed', `analyze:${persona.id}`, {
            label: `${persona.name} complete — ${findingCount} findings, score: ${scorecard.overall_score}/100`,
          });
          return { persona, scorecard };
        } catch (err) {
          await emitEvent('step.failed', `analyze:${persona.id}`, {
            label: `${persona.name} failed`,
            error: String(err),
          });
          return { persona, error: String(err) };
        }
      }),
    );

    // Step 3: Store results
    for (const r of results) {
      if ('error' in r) continue;
      const sc = r.scorecard;
      if (!sc) continue;

      const scResult = await db
        .prepare(
          `INSERT INTO scorecards (run_id, persona_id, overall_score, relevance, summary, raw_response, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        )
        .bind(runId, r.persona.id, sc.overall_score, sc.relevance, sc.summary, JSON.stringify(sc), Date.now())
        .run();

      const scorecardId = scResult.meta.last_row_id;

      for (const cat of sc.categories) {
        for (const f of cat.findings) {
          await db
            .prepare(
              `INSERT INTO findings (scorecard_id, category_id, severity, title, description, evidence, recommendation, reasoning)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
            )
            .bind(scorecardId, cat.id, f.severity, f.title, f.description, f.evidence, f.recommendation, f.reasoning)
            .run();
        }
      }
    }

    // Mark run complete
    const now = Date.now();
    const startedRow = await db
      .prepare('SELECT started_at FROM runs WHERE id=?1')
      .bind(runId)
      .first<{ started_at: number }>();
    const durationMs = startedRow ? now - startedRow.started_at : 0;

    await db
      .prepare('UPDATE runs SET status=?1, completed_at=?2, total_duration_ms=?3 WHERE id=?4')
      .bind('completed', now, durationMs, runId)
      .run();

    await emitEvent('pipeline.completed', null, { duration_ms: durationMs });
  } catch (err) {
    await db
      .prepare('UPDATE runs SET status=?1, error=?2, completed_at=?3 WHERE id=?4')
      .bind('failed', String(err), Date.now(), runId)
      .run();
    await emitEvent('pipeline.failed', null, { error: String(err) });
  }
}
