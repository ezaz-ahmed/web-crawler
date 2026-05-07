import type { Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import type { MemberLoungeEvent } from '../../../types.js';

async function extractEventsFromCurrentPage(
  page: Page,
): Promise<MemberLoungeEvent[]> {
  const html = await page.content();
  const $ = cheerio.load(html);
  const events: MemberLoungeEvent[] = [];

  $('a, article, .event-card, .card, li').each((_, element) => {
    const node = $(element);
    const text = node.text().trim();

    if (!text) return;

    const href =
      node.attr('href') ||
      node.find('a[href]').first().attr('href') ||
      undefined;

    const heading =
      node.find('h1,h2,h3,h4,h5').first().text().trim() ||
      text
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0) ||
      'Untitled event';

    if (
      !/event|register|session|conference|workshop|webinar|seminar/i.test(
        text,
      ) &&
      !/\/event/i.test(href || '')
    ) {
      return;
    }

    events.push({
      title: heading,
      description: text.slice(0, 500),
      url: href,
      isRegistered: false,
    });
  });

  const unique = new Map<string, MemberLoungeEvent>();
  for (const item of events) {
    const key = item.url || item.title;
    if (!unique.has(key)) {
      unique.set(key, item);
    }
  }

  return Array.from(unique.values());
}

export async function crawlCsaeEvents(
  baseUrl: string,
  page: Page,
): Promise<MemberLoungeEvent[]> {
  const eventPaths = [
    '/events',
    '/education/events',
    '/education',
    '/calendar',
  ];
  let events: MemberLoungeEvent[] = [];

  for (const path of eventPaths) {
    try {
      await page.goto(`${baseUrl}${path}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      });
      const found = await extractEventsFromCurrentPage(page);
      if (found.length > 0) {
        events = [...events, ...found];
        break;
      }
    } catch {
      // try next path
    }
  }

  return events;
}
