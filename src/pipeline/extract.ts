export interface ExtractionResult {
  markdown: string;
  wordCount: number;
  truncated: boolean;
}

export async function extractContent(
  env: Env,
  inputType: 'url' | 'text' | 'file',
  inputUrl?: string | null,
  inputText?: string | null,
  inputR2Key?: string | null,
  inputFilename?: string | null,
): Promise<ExtractionResult> {
  let markdown: string;

  if (inputType === 'url' && inputUrl) {
    // Normalize URL — add https:// if no protocol present
    const normalizedUrl = /^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`;

    // Try direct fetch first, fall back to Browser Rendering for JS-heavy sites
    let html: string;
    const directRes = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    if (directRes.ok) {
      html = await directRes.text();
    } else {
      // Fallback: Browser Rendering via binding renders with a headless browser.
      // Handles JS-rendered SPAs and sites that block bot User-Agents.
      try {
        const browserRes = await env.BROWSER.fetch(`https://browser-rendering.cloudflare.com/content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: normalizedUrl }),
        });
        if (!browserRes.ok) {
          throw new Error(`Browser rendering returned ${browserRes.status}`);
        }
        html = await browserRes.text();
      } catch (browserErr) {
        throw new Error(`Failed to fetch URL (HTTP ${directRes.status}). Try pasting the content in the "Text" tab instead.`);
      }
    }

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
  } else if (inputType === 'file' && inputR2Key) {
    const obj = await env.UPLOADS.get(inputR2Key);
    if (!obj) throw new Error('Uploaded file not found in storage');
    const blob = new Blob([await obj.arrayBuffer()]);
    const filename = inputFilename ?? 'upload.bin';
    const result = await env.AI.toMarkdown([{ name: filename, blob }]);
    const first = result[0];
    markdown = first && first.format === 'markdown' ? first.data : '';
    if (!markdown || markdown.length < 10) {
      throw new Error('Could not extract text from file. Try a different format (PDF, DOCX, HTML).');
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
