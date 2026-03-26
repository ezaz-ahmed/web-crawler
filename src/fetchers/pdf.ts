import pdfParse from 'pdf-parse';
import { config } from '../config.js';
import type { FetchResult } from '../types.js';

/**
 * Fetch and extract text from a PDF document
 */
export async function fetchPdf(url: string): Promise<FetchResult> {
  console.log(`Fetching PDF: ${url}`);

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

    // Download PDF as buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse PDF
    const data = await pdfParse(buffer);

    // Extract title from metadata or filename
    const urlObj = new URL(url);
    const filename = urlObj.pathname.split('/').pop() || 'document.pdf';
    const title = (data.info?.Title as string) || filename.replace('.pdf', '');

    // Clean up text
    const content = data.text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');

    console.log(
      `✓ Fetched PDF: ${title} (${data.numpages} pages, ${content.length} chars)`,
    );

    return {
      content,
      links: [], // PDFs don't have extractable links in this simple approach
      title,
      contentType: 'pdf',
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(
          `Request timeout after ${config.crawler.requestTimeout}ms`,
        );
      }
      throw new Error(`PDF parsing error: ${error.message}`);
    }
    throw new Error('Unknown error fetching PDF');
  } finally {
    clearTimeout(timeout);
  }
}
