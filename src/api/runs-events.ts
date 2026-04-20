export async function handleRunsEvents(request: Request, env: Env, runId: string): Promise<Response> {
  const lastEventId = parseInt(request.headers.get('Last-Event-ID') ?? '0');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastSeq = lastEventId;
      let attempts = 0;
      const maxAttempts = 300; // 5 minutes at 1s polling

      while (attempts < maxAttempts) {
        const events = await env.DB.prepare(
          'SELECT * FROM audit WHERE run_id = ?1 AND seq > ?2 ORDER BY seq',
        )
          .bind(runId, lastSeq)
          .all();

        if (events.results?.length) {
          for (const e of events.results) {
            const evt = e as Record<string, unknown>;
            const data = JSON.stringify({
              type: evt.event_type,
              step: evt.step_id,
              ...JSON.parse(evt.payload_json as string),
            });
            controller.enqueue(encoder.encode(`id: ${evt.seq}\nevent: ${evt.event_type}\ndata: ${data}\n\n`));
            lastSeq = evt.seq as number;
          }
        }

        // Check if pipeline is done
        const run = await env.DB.prepare('SELECT status FROM runs WHERE id = ?1').bind(runId).first<{ status: string }>();
        if (run?.status === 'completed' || run?.status === 'failed') {
          controller.close();
          return;
        }

        // Wait before next poll
        await new Promise((r) => setTimeout(r, 1000));
        attempts++;
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
