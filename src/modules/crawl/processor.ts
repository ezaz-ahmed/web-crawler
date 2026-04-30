import OpenAI from 'openai';
import { config } from '../../config/env.js';
import { mergeInstructions, createUserMessage } from './prompt.js';

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

const MAX_CONTENT_LENGTH = 100000;

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }

  console.warn(
    `Content truncated from ${content.length} to ${maxLength} chars`,
  );

  return (
    content.substring(0, maxLength) + '\n\n[Content truncated due to length...]'
  );
}

export async function convertToMarkdown(
  content: string,
  title: string,
  url: string,
  instructions?: string,
): Promise<string> {
  console.log(`Converting to markdown with AI: ${title}`);

  const truncatedContent = truncateContent(content, MAX_CONTENT_LENGTH);

  if (!truncatedContent.trim()) {
    throw new Error('No extractable page content found for AI conversion');
  }

  const systemPrompt = mergeInstructions(instructions);
  const userMessage = createUserMessage(title, truncatedContent, url);

  let retries = 0;
  const maxRetries = 3;
  let lastError: Error | null = null;

  while (retries < maxRetries) {
    try {
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

      console.log(`✓ AI conversion complete (${markdown.length} chars)`);
      return markdown.trim();
    } catch (error) {
      lastError = error as Error;

      if (error instanceof OpenAI.APIError && error.status === 429) {
        retries++;
        const backoffDelay = Math.pow(2, retries) * 1000;
        console.warn(
          `Rate limited by OpenAI, retrying in ${backoffDelay}ms (attempt ${retries}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `OpenAI conversion failed after ${maxRetries} retries: ${lastError?.message}`,
  );
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
