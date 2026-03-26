import PQueue from 'p-queue';
import { crawlSingleUrl } from './url.js';
import { matchesPatterns, isSameOrigin, normalizeUrl } from './patterns.js';
import { config } from '../config.js';
import type { PageResult } from '../types.js';

/**
 * Recursively crawl a website starting from a root URL
 */
export async function crawlWebsite(
  rootUrl: string,
  crawlDepth: number,
  maxPages: number,
  includePatterns?: string[],
  excludePatterns?: string[],
  onProgress?: (current: number, total: number) => void,
): Promise<PageResult[]> {
  console.log(
    `Starting website crawl: ${rootUrl} (depth: ${crawlDepth}, max: ${maxPages})`,
  );

  const results: PageResult[] = [];
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [
    { url: rootUrl, depth: 0 },
  ];

  // Rate limiting: 1 request per domain every N milliseconds
  const rateLimiter = new PQueue({
    interval: config.crawler.rateLimitPerDomain,
    intervalCap: 1,
    concurrency: 1,
  });

  while (queue.length > 0 && results.length < maxPages) {
    const item = queue.shift()!;
    const normalizedUrl = normalizeUrl(item.url);

    // Skip if already visited
    if (visited.has(normalizedUrl)) {
      continue;
    }

    // Skip if depth exceeded
    if (item.depth > crawlDepth) {
      continue;
    }

    // Skip if doesn't match patterns
    if (!matchesPatterns(item.url, includePatterns, excludePatterns)) {
      continue;
    }

    // Skip if not same origin
    if (!isSameOrigin(item.url, rootUrl)) {
      continue;
    }

    // Mark as visited
    visited.add(normalizedUrl);

    try {
      // Crawl the page with rate limiting
      const pageResult = await rateLimiter.add(() => crawlSingleUrl(item.url));

      if (pageResult) {
        results.push(pageResult);

        // Report progress
        if (onProgress) {
          onProgress(
            results.length,
            Math.min(maxPages, results.length + queue.length),
          );
        }

        console.log(
          `✓ Crawled (${results.length}/${maxPages}): ${pageResult.title} - ${pageResult.url}`,
        );

        // Add discovered links to queue if we haven't reached max depth
        if (item.depth < crawlDepth) {
          for (const link of pageResult.links) {
            const normalizedLink = normalizeUrl(link);
            if (
              !visited.has(normalizedLink) &&
              isSameOrigin(link, rootUrl) &&
              matchesPatterns(link, includePatterns, excludePatterns)
            ) {
              queue.push({ url: link, depth: item.depth + 1 });
            }
          }
        }
      }
    } catch (error) {
      console.error(`✗ Failed to crawl ${item.url}:`, error);
      // Continue with next URL on error
    }

    // Check if we've reached max pages
    if (results.length >= maxPages) {
      console.log(`Reached max pages limit (${maxPages})`);
      break;
    }
  }

  console.log(`✓ Website crawl complete: ${results.length} pages crawled`);
  return results;
}
