import mammoth from 'mammoth';
import { config } from '../config.js';
import type { FetchResult } from '../types.js';

/**
 * Fetch and extract text from a DOCX document
 */
export async function fetchDocx(url: string): Promise<FetchResult> {
  console.log(`Fetching DOCX: ${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.crawler.requestTimeout,
  );

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': config.crawler.userAgent,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Download DOCX as buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text with mammoth
    const result = await mammoth.extractRawText({ buffer });

    // Extract title from filename
    const urlObj = new URL(url);
    const filename = urlObj.pathname.split('/').pop() || 'document.docx';
    const title = filename.replace(/\.(docx|doc)$/i, '');

    // Clean up text
    const content = result.value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');

    console.log(`✓ Fetched DOCX: ${title} (${content.length} chars)`);

    return {
      content,
      links: [], // DOCX links not extracted in simple approach
      title,
      contentType: 'docx',
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(
          `Request timeout after ${config.crawler.requestTimeout}ms`,
        );
      }
      throw new Error(`DOCX parsing error: ${error.message}`);
    }
    throw new Error('Unknown error fetching DOCX');
  } finally {
    clearTimeout(timeout);
  }
}
