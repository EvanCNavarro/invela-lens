export interface ExtractionResult {
  markdown: string;
  wordCount: number;
  truncated: boolean;
}

export async function extractContent(
  env: Env,
  inputType: 'url' | 'text',
  inputUrl?: string | null,
  inputText?: string | null,
): Promise<ExtractionResult> {
  let markdown: string;

  if (inputType === 'url' && inputUrl) {
    const response = await fetch(inputUrl, {
      headers: { 'User-Agent': 'PersonaLens/1.0 (content analysis tool)' },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: HTTP ${response.status}`);
    }
    const html = await response.text();

    const result = await env.AI.toMarkdown([{ name: 'page.html', blob: new Blob([html]) }]);
    const first = result[0];
    markdown = first && first.format === 'markdown' ? first.data : '';

    if (markdown.length < 100) {
      // Fallback: strip tags and extract raw text
      markdown = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  } else if (inputType === 'text' && inputText) {
    markdown = inputText;
  } else {
    throw new Error('No content provided');
  }

  // Token estimation: ~1.3 tokens per word, cap at ~30K words (~40K tokens)
  const words = markdown.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;
  let truncated = false;

  if (wordCount > 30000) {
    markdown = words.slice(0, 30000).join(' ');
    truncated = true;
  }

  return { markdown, wordCount, truncated };
}
