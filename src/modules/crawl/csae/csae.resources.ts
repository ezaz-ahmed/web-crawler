import type { Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import type { MemberLoungeResource } from '../../../types.js';

async function extractResourcesFromCurrentPage(
  page: Page,
): Promise<MemberLoungeResource[]> {
  const html = await page.content();
  const $ = cheerio.load(html);
  const resources: MemberLoungeResource[] = [];

  $('article, .card, .resource-card, li, a').each((_, element) => {
    const node = $(element);
    const text = node.text().trim();

    if (
      !text ||
      !/resource|download|document|pdf|docx|publication|guide|report/i.test(
        text,
      )
    ) {
      return;
    }

    const href =
      node.attr('href') ||
      node.find('a[href]').first().attr('href') ||
      undefined;

    const title =
      node.find('h1,h2,h3,h4,h5').first().text().trim() ||
      text
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0) ||
      'Untitled resource';

    const fileLinks = node
      .find('a[href]')
      .toArray()
      .map((link) => {
        const linkNode = $(link);
        const linkUrl = linkNode.attr('href') || '';
        const name =
          linkNode.text().trim() || linkUrl.split('/').pop() || 'file';
        const lower = linkUrl.toLowerCase();
        const type: 'pdf' | 'docx' | 'other' = lower.endsWith('.pdf')
          ? 'pdf'
          : lower.endsWith('.docx') || lower.endsWith('.doc')
            ? 'docx'
            : 'other';
        return { name, url: linkUrl, type };
      })
      .filter((item) => item.url.length > 0);

    resources.push({
      title,
      description: text.slice(0, 500),
      url: href,
      isPurchased: false,
      files: fileLinks,
    });
  });

  const deduped = new Map<string, MemberLoungeResource>();
  for (const item of resources) {
    const key = item.url || item.title;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return Array.from(deduped.values());
}

export async function crawlCsaeResources(
  baseUrl: string,
  page: Page,
): Promise<MemberLoungeResource[]> {
  const resourcePaths = [
    '/resources',
    '/knowledge',
    '/knowledge/resources',
    '/publications',
    '/library',
  ];

  for (const path of resourcePaths) {
    try {
      await page.goto(`${baseUrl}${path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      });
      const found = await extractResourcesFromCurrentPage(page);
      if (found.length > 0) {
        return found;
      }
    } catch {
      // try next path
    }
  }

  return [];
}
