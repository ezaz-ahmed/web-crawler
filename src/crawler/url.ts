import { detectContentType } from '../fetchers/detect.js';
import { fetchHtml } from '../fetchers/html.js';
import { fetchPdf } from '../fetchers/pdf.js';
import { fetchDocx } from '../fetchers/docx.js';
import { isAllowedByRobots } from './robots.js';
import type { PageResult } from '../types.js';

/**
 * Crawl a single URL and return the page result
 */
export async function crawlSingleUrl(
  url: string,
  includePatterns?: string[],
  excludePatterns?: string[],
): Promise<PageResult> {
  console.log(`Crawling single URL: ${url}`);

  // Check robots.txt
  const allowed = await isAllowedByRobots(url);
  if (!allowed) {
    throw new Error(`URL blocked by robots.txt: ${url}`);
  }

  // First, make a HEAD request to detect content type
  let contentTypeHeader: string | undefined;
  try {
    const headResponse = await fetch(url, { method: 'HEAD' });
    contentTypeHeader = headResponse.headers.get('content-type') || undefined;
  } catch {
    // If HEAD fails, proceed with GET and detect from URL
  }

  // Detect content type
  const contentType = detectContentType(url, contentTypeHeader);

  // Fetch based on content type
  let fetchResult;
  switch (contentType) {
    case 'html':
      fetchResult = await fetchHtml(url);
      break;
    case 'pdf':
      fetchResult = await fetchPdf(url);
      break;
    case 'docx':
      fetchResult = await fetchDocx(url);
      break;
    case 'unsupported':
      throw new Error(`Unsupported content type for URL: ${url}`);
  }

  // Build page result
  const trimmedContent = fetchResult.content.trim();
  const wordCount = trimmedContent.length
    ? trimmedContent.split(/\s+/).length
    : 0;

  const pageResult: PageResult = {
    url,
    title: fetchResult.title,
    content: fetchResult.content,
    links: fetchResult.links,
    wordCount,
    fetchedAt: new Date(),
  };

  return pageResult;
}
