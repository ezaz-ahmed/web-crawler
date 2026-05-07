import type { Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import type { MemberLoungeEvent } from '../../../types.js';

async function extractEventsFromCurrentPage(
  page: Page,
): Promise<MemberLoungeEvent[]> {
  const html = await page.content();
  const $ = cheerio.load(html);
  const events: MemberLoungeEvent[] = [];

  $('a, article, .event-card, .card').each((_, element) => {
    const node = $(element);
    const text = node.text().trim();

    if (!text) {
      return;
    }

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
      !/event|register|session|speaker|ticket/i.test(text) &&
      !/\/events/i.test(href || '')
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

function normalizeKey(value: string | undefined): string {
  return (value || '').trim().toLowerCase();
}

export async function crawlEvents(
  baseUrl: string,
  page: Page,
): Promise<MemberLoungeEvent[]> {
  await page.goto(`${baseUrl}/events`, {
    waitUntil: 'domcontentloaded',
  });
  const events = await extractEventsFromCurrentPage(page);

  await page.goto(`${baseUrl}/events/my-events`, {
    waitUntil: 'domcontentloaded',
  });
  const myEvents = await extractEventsFromCurrentPage(page);

  const registeredLookup = new Set(
    myEvents.flatMap((item) => [
      normalizeKey(item.title),
      normalizeKey(item.url),
    ]),
  );

  return events.map((event) => {
    const isRegistered =
      registeredLookup.has(normalizeKey(event.title)) ||
      registeredLookup.has(normalizeKey(event.url));

    return {
      ...event,
      isRegistered,
    };
  });
}

export async function crawlAdminEvents(
  baseUrl: string,
  page: Page,
): Promise<MemberLoungeEvent[]> {
  await page.goto(`${baseUrl}/events/all-events`, {
    waitUntil: 'domcontentloaded',
  });

  return extractEventsFromCurrentPage(page);
}
