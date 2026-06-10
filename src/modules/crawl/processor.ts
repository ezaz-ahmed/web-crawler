import OpenAI from 'openai';
import { config } from '../../config/env.js';
import { mergeInstructions, createUserMessage } from './prompt.js';

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

const CHUNK_SIZE = 15000;

function splitIntoChunks(text: string, maxLength: number): string[] {
  const chunks: string[] = [];

  let start = 0;

  while (start < text.length) {
    let end = start + maxLength;

    if (end < text.length) {
      const lastParagraph = text.lastIndexOf('\n\n', end);

      if (lastParagraph > start) {
        end = lastParagraph;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end;
  }

  return chunks;
}

async function convertChunkToMarkdown(
  content: string,
  title: string,
  url: string,
  instructions?: string,
): Promise<string> {
  const systemPrompt = mergeInstructions(instructions);
  const userMessage = createUserMessage(title, content, url);

  const completion = await openai.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  const markdown = completion.choices[0]?.message?.content;

  if (!markdown) {
    throw new Error('No content returned from OpenAI');
  }

  return markdown.trim();
}

export async function convertToMarkdown(
  content: string,
  title: string,
  url: string,
  instructions?: string,
): Promise<string> {
  console.log(`Converting to markdown with AI: ${title}`);

  if (!content.trim()) {
    throw new Error('No extractable page content found for AI conversion');
  }

  const chunks = splitIntoChunks(content, CHUNK_SIZE);

  console.log(
    `Document split into ${chunks.length} chunk(s) (${content.length} chars)`,
  );

  const markdownParts: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(
      `Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`,
    );

    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        const markdown = await convertChunkToMarkdown(
          chunks[i],
          title,
          url,
          instructions,
        );

        markdownParts.push(markdown);

        break;
      } catch (error) {
        if (error instanceof OpenAI.APIError && error.status === 429) {
          retries++;

          const delay = Math.pow(2, retries) * 1000;

          console.warn(`Rate limited. Retrying chunk ${i + 1} in ${delay}ms`);

          await new Promise((resolve) => setTimeout(resolve, delay));

          continue;
        }

        throw error;
      }
    }
  }

  const combinedMarkdown = markdownParts.join('\n\n---\n\n');

  console.log(`✓ AI conversion complete (${combinedMarkdown.length} chars)`);

  return combinedMarkdown;
}

export async function convertPagesToMarkdown(
  pages: Array<{ content: string; title: string; url: string }>,
  instructions?: string,
  onProgress?: (current: number, total: number) => void,
): Promise<string[]> {
  const results: string[] = [];
  const delayBetweenRequests = 1000;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    try {
      const markdown = await convertToMarkdown(
        page.content,
        page.title,
        page.url,
        instructions,
      );
      results.push(markdown);

      if (onProgress) {
        onProgress(i + 1, pages.length);
      }

      if (i < pages.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenRequests),
        );
      }
    } catch (error) {
      console.error(`✗ Failed to convert page ${page.url}:`, error);
      results.push(
        `# ${page.title}\n\n[Conversion failed: ${(error as Error).message}]`,
      );
    }
  }

  return results;
}
