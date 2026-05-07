import type { Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import type { MemberLoungeDiscussion } from '../../../types.js';

export async function crawlDiscussions(
  baseUrl: string,
  page: Page,
): Promise<MemberLoungeDiscussion[]> {
  await page.goto(`${baseUrl}/discussions`, {
    waitUntil: 'domcontentloaded',
  });

  const html = await page.content();
  const $ = cheerio.load(html);
  const discussions: MemberLoungeDiscussion[] = [];

  $('article, .card, .discussion-card, li, a').each((_, element) => {
    const node = $(element);
    const text = node.text().trim();

    if (!text || !/discussion|thread|topic|reply|comment/i.test(text)) {
      return;
    }

    const title =
      node.find('h1,h2,h3,h4,h5').first().text().trim() ||
      text
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0) ||
      'Untitled discussion';

    const href =
      node.attr('href') ||
      node.find('a[href]').first().attr('href') ||
      undefined;

    discussions.push({
      title,
      summary: text.slice(0, 500),
      url: href,
    });
  });

  const deduped = new Map<string, MemberLoungeDiscussion>();
  for (const item of discussions) {
    const key = item.url || item.title;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return Array.from(deduped.values());
}
