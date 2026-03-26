import { XMLParser } from 'fast-xml-parser';
import { config } from '../config.js';
import { matchesPatterns } from './patterns.js';

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

interface Sitemap {
  loc: string;
}

/**
 * Parse a sitemap XML and extract URLs
 */
export async function parseSitemap(
  sitemapUrl: string,
  includePatterns?: string[],
  excludePatterns?: string[],
): Promise<string[]> {
  console.log(`Parsing sitemap: ${sitemapUrl}`);

  const response = await fetch(sitemapUrl, {
    headers: {
      'User-Agent': config.crawler.userAgent,
    },
    signal: AbortSignal.timeout(config.crawler.requestTimeout),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap: HTTP ${response.status}`);
  }

  const xml = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
  });

  const result = parser.parse(xml);

  const urls: string[] = [];

  // Check if this is a sitemap index (contains other sitemaps)
  if (result.sitemapindex?.sitemap) {
    const sitemaps = Array.isArray(result.sitemapindex.sitemap)
      ? result.sitemapindex.sitemap
      : [result.sitemapindex.sitemap];

    console.log(`Found sitemap index with ${sitemaps.length} child sitemaps`);

    // Recursively parse child sitemaps
    for (const sitemap of sitemaps as Sitemap[]) {
      if (sitemap.loc) {
        const childUrls = await parseSitemap(
          sitemap.loc,
          includePatterns,
          excludePatterns,
        );
        urls.push(...childUrls);
      }
    }
  }
  // Regular sitemap with URLs
  else if (result.urlset?.url) {
    const urlEntries = Array.isArray(result.urlset.url)
      ? result.urlset.url
      : [result.urlset.url];

    for (const entry of urlEntries as SitemapUrl[]) {
      if (entry.loc) {
        // Apply pattern matching
        if (matchesPatterns(entry.loc, includePatterns, excludePatterns)) {
          urls.push(entry.loc);
        }
      }
    }

    console.log(
      `Found ${urlEntries.length} URLs in sitemap, ${urls.length} after filtering`,
    );
  } else {
    console.warn('No URLs found in sitemap');
  }

  return urls;
}
