import { detectContentType } from '../fetchers/detect.fetcher.js';
import { fetchHtml } from '../fetchers/html.fetcher.js';
import { fetchPdf } from '../fetchers/pdf.fetcher.js';
import { fetchDocx } from '../fetchers/docx.fetcher.js';
import { isAllowedByRobots } from './robots.js';
import type { PageResult } from '../../../types.js';

export async function crawlSingleUrl(
  url: string,
  includePatterns?: string[],
  excludePatterns?: string[],
): Promise<PageResult> {
  void includePatterns;
  void excludePatterns;
  console.log(`Crawling single URL: ${url}`);

  const allowed = await isAllowedByRobots(url);
  if (!allowed) {
    throw new Error(`URL blocked by robots.txt: ${url}`);
  }

  let contentTypeHeader: string | undefined;
  try {
    const headResponse = await fetch(url, { method: 'HEAD' });
    contentTypeHeader = headResponse.headers.get('content-type') || undefined;
  } catch {
    // If HEAD fails, proceed with GET and detect from URL.
  }

  const contentType = detectContentType(url, contentTypeHeader);

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
