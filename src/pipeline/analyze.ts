interface Persona {
  id: number;
  name: string;
  title: string;
  archetype: string;
  industry: string;
  description: string;
  responsibilities: string;
  concerns: string; // JSON array
  quotes: string; // JSON array
  decision_criteria: string; // JSON array
}

export interface ScorecardResult {
  overall_score: number;
  relevance: string;
  summary: string;
  categories: Array<{
    id: string;
    name: string;
    score: number;
    findings: Array<{
      severity: string;
      title: string;
      description: string;
      evidence: string;
      recommendation: string;
      reasoning: string;
    }>;
  }>;
}

export async function analyzeWithPersona(
  apiKey: string,
  persona: Persona,
  content: string,
  contentSource: string,
  wordCount: number,
): Promise<ScorecardResult> {
  const concerns: string[] = JSON.parse(persona.concerns || '[]');
  const quotes: string[] = JSON.parse(persona.quotes || '[]');
  const criteria: string[] = JSON.parse(persona.decision_criteria || '[]');

  const systemPrompt = `You are ${persona.name}, ${persona.title} in the ${persona.industry} industry.

## Your Professional Profile
- Role: ${persona.title}
- Archetype: "${persona.archetype}"
- Responsibilities: ${persona.responsibilities || 'Not specified'}

## Your Concerns
${concerns.map((c) => `- ${c}`).join('\n')}

## Your Own Words
${quotes.map((q) => `- "${q}"`).join('\n')}

## Your Decision Criteria
${criteria.map((c) => `- ${c}`).join('\n')}

## Your Task
Evaluate this marketing content AS IF you are this persona encountering it for the first time. You are skeptical and experienced.

Evaluate across these categories:
1. Messaging Fit — Does the content speak to your concerns?
2. Trust & Credibility — Are claims substantiated?
3. Risk & Compliance Framing — Does it address regulatory/risk concerns?
4. Call-to-Action Relevance — Are next steps appropriate for your seniority?
5. Competitive Differentiation — Why is this better than alternatives?
6. Technical Depth — Is detail level right for your expertise?

## Scoring
Start at 100 per category. Deduct: critical -15, high -10, medium -5, low -2. Floor 0.
Overall = average of category scores.
If content has no connection to your role, set relevance to "low" or "none".`;

  const userPrompt = `## Content Analysis Request

**Source:** ${contentSource}
**Word count:** ${wordCount}

---

${content}

---

Analyze this content from your persona's perspective using the scorecard_output tool.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [
        {
          name: 'scorecard_output',
          description: 'Return the structured persona-based content analysis scorecard.',
          input_schema: {
            type: 'object',
            required: ['overall_score', 'relevance', 'summary', 'categories'],
            properties: {
              overall_score: { type: 'number', minimum: 0, maximum: 100 },
              relevance: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
              summary: { type: 'string' },
              categories: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'name', 'score', 'findings'],
                  properties: {
                    id: {
                      type: 'string',
                      enum: [
                        'messaging_fit',
                        'trust_credibility',
                        'risk_compliance_framing',
                        'cta_relevance',
                        'competitive_differentiation',
                        'technical_depth',
                      ],
                    },
                    name: { type: 'string' },
                    score: { type: 'number', minimum: 0, maximum: 100 },
                    findings: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['severity', 'title', 'description', 'evidence', 'recommendation', 'reasoning'],
                        properties: {
                          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                          title: { type: 'string' },
                          description: { type: 'string' },
                          evidence: { type: 'string' },
                          recommendation: { type: 'string' },
                          reasoning: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'scorecard_output' },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Claude API ${response.status}: ${errBody.slice(0, 300)}`);
  }

  const result: Record<string, unknown> = (await response.json()) as Record<string, unknown>;

  // Extract the tool_use result
  const contentBlocks = result.content as Array<{ type: string; input?: unknown }> | undefined;
  const toolBlock = contentBlocks?.find((b) => b.type === 'tool_use');
  if (!toolBlock?.input) {
    throw new Error('Claude did not return structured scorecard output');
  }

  return toolBlock.input as ScorecardResult;
}
