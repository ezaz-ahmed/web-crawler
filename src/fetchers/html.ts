import * as cheerio from 'cheerio';
import { config } from '../config.js';
import type { FetchResult } from '../types.js';

/**
 * Fetch and parse HTML content from a URL
 */
export async function fetchHtml(url: string): Promise<FetchResult> {
  console.log(`Fetching HTML: ${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    config.crawler.requestTimeout,
  );

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': config.crawler.userAgent,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract title
    const title =
      $('title').text().trim() ||
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content') ||
      new URL(url).pathname;

    // Remove unwanted elements
    $('script').remove();
    $('style').remove();
    $('nav').remove();
    $('header').remove();
    $('footer').remove();
    $('aside').remove();
    $('.advertisement, .ad, .ads, .banner, .cookie-banner, .popup').remove();
    $('[role="navigation"]').remove();
    $('[role="banner"]').remove();
    $('[role="complementary"]').remove();

    // Extract main content
    let content = '';
    const mainContent =
      $('main').first() ||
      $('article').first() ||
      $('[role="main"]').first() ||
      $('body');

    content = mainContent.text();

    // Clean up whitespace
    content = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');

    // Extract all links
    const links: string[] = [];
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        try {
          // Resolve relative URLs
          const absoluteUrl = new URL(href, url).toString();
          // Only include http(s) links
          if (
            absoluteUrl.startsWith('http://') ||
            absoluteUrl.startsWith('https://')
          ) {
            links.push(absoluteUrl);
          }
        } catch {
          // Skip invalid URLs
        }
      }
    });

    // Deduplicate links
    const uniqueLinks = Array.from(new Set(links));

    console.log(
      `✓ Fetched HTML: ${title} (${content.length} chars, ${uniqueLinks.length} links)`,
    );

    return {
      content,
      links: uniqueLinks,
      title,
      contentType: 'html',
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(
          `Request timeout after ${config.crawler.requestTimeout}ms`,
        );
      }
      throw error;
    }
    throw new Error('Unknown error fetching HTML');
  } finally {
    clearTimeout(timeout);
  }
}
