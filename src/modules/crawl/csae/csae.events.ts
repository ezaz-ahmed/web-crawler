import type { Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import type { MemberLoungeEvent } from '../../../types.js';
import { logger } from '../../../utils/logger.js';

const CSAE_EVENTS_CALENDAR_PATH = '/events/calendar';

const EVENT_LIST_SELECTOR = '.row.event-list-item.no-margin';
const EVENT_DETAIL_LINK_SELECTOR = 'a[href*="/events/event-description"]';

function normalizeWhitespace(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function resolveUrl(
  currentUrl: string,
  href: string | undefined,
): string | undefined {
  if (!href) {
    return undefined;
  }

  try {
    return new URL(href, currentUrl).toString();
  } catch {
    return undefined;
  }
}

function pickLongestText($: cheerio.CheerioAPI, selectors: string[]): string {
  let longest = '';

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const text = normalizeWhitespace($(element).text());
      if (text.length > longest.length) {
        longest = text;
      }
    });
  }

  return longest;
}

function pickFirstText(
  $: cheerio.CheerioAPI,
  selectors: string[],
): string | undefined {
  for (const selector of selectors) {
    const text = normalizeWhitespace($(selector).first().text());
    if (text) {
      return text;
    }
  }

  return undefined;
}

function matchLabeledValue(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const pattern = new RegExp(
      `${label}\\s*[:\\-]\\s*(.+?)(?=(?:\\b[A-Z][A-Za-z ]{2,20}\\s*[:\\-])|$)`,
      'i',
    );
    const match = text.match(pattern);
    if (match?.[1]) {
      return normalizeWhitespace(match[1]);
    }
  }

  return undefined;
}

function buildEventMarkdown(
  event: MemberLoungeEvent,
  detailText: string,
): string {
  const lines = [`# ${event.title}`];

  if (event.url) {
    lines.push(`- URL: ${event.url}`);
  }

  if (event.startDate) {
    lines.push(`- Start: ${event.startDate}`);
  }

  if (event.endDate) {
    lines.push(`- End: ${event.endDate}`);
  }

  if (event.location) {
    lines.push(`- Location: ${event.location}`);
  }

  if (event.locations?.length) {
    lines.push(`- Locations: ${event.locations.join(', ')}`);
  }

  if (event.thumbnailImageUrl) {
    lines.push(`- Thumbnail Image URL: ${event.thumbnailImageUrl}`);
  }

  lines.push(`- Registered: ${event.isRegistered ? 'Yes' : 'No'}`);

  if (event.description) {
    lines.push('', '## Summary', '', event.description);
  }

  if (event.details) {
    lines.push('', '## Event Details', '', event.details);
  }

  if (detailText) {
    lines.push('', '## Details', '', detailText);
  }

  return lines.join('\n').trim();
}

async function waitForPageToSettle(page: Page, step: string): Promise<void> {
  logger.info(`CSAE event step: waiting for page to settle after ${step}`);

  try {
    await page.waitForNetworkIdle({ timeout: 10_000 });
  } catch {
    logger.info(
      `CSAE event step: network idle timeout after ${step}, continuing`,
    );
  }
}

async function extractEventsFromCurrentPage(
  page: Page,
): Promise<MemberLoungeEvent[]> {
  const html = await page.content();
  const $ = cheerio.load(html);
  const events: MemberLoungeEvent[] = [];
  const currentUrl = page.url();

  $(EVENT_LIST_SELECTOR).each((_, element) => {
    const node = $(element);
    const text = normalizeWhitespace(node.text());

    if (!text) {
      return;
    }

    const href = resolveUrl(
      currentUrl,
      node.find(EVENT_DETAIL_LINK_SELECTOR).first().attr('href') ||
        node.find('a[href]').first().attr('href') ||
        undefined,
    );

    const heading =
      normalizeWhitespace(
        node.find(EVENT_DETAIL_LINK_SELECTOR).first().text() ||
          node.find('h1,h2,h3,h4,h5').first().text(),
      ) ||
      text
        .split('\n')
        .find((line) => line.trim().length > 0)
        ?.trim() ||
      'Untitled event';

    const location = pickFirstText($, []);

    events.push({
      title: heading,
      description: text.slice(0, 500),
      details: text,
      location,
      locations: location ? [location] : undefined,
      url: href,
      isRegistered: /registered|attending|my event/i.test(text),
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

async function extractEventDetailsFromCurrentPage(
  page: Page,
  seed: MemberLoungeEvent,
): Promise<MemberLoungeEvent> {
  const html = await page.content();
  const $ = cheerio.load(html);
  const detailText = pickLongestText($, [
    'main',
    'article',
    '.event-description',
    '.event-details',
    '.panel-body',
    '.event-detail',
    '.content',
    '.container',
    'body',
  ]);
  const title =
    pickFirstText($, ['h1', '.event-title', '.page-title', 'title']) ||
    normalizeWhitespace($('title').first().text()) ||
    seed.title;
  const description =
    normalizeWhitespace(
      $('meta[name="description"]').attr('content') ||
        $(
          'article p, main p, .event-details p, .event-description p, .content p',
        )
          .first()
          .text(),
    ) || seed.description;

  const details =
    pickFirstText($, [
      '.event-description',
      '.event-details',
      '.panel-body',
      'article',
      'main',
    ]) || detailText;

  const locationTexts = [
    ...new Set(
      [
        ...$('.event-location, .location, [class*="location"]')
          .toArray()
          .map((element) => normalizeWhitespace($(element).text())),
        matchLabeledValue(detailText, ['Location', 'Venue', 'Where']) || '',
      ].filter((value) => value.length > 0),
    ),
  ];

  const thumbnailImageUrl = resolveUrl(
    page.url(),
    $('meta[property="og:image"]').attr('content') ||
      $('.event-image img, .event-banner img, img').first().attr('src') ||
      undefined,
  );

  const event: MemberLoungeEvent = {
    ...seed,
    title,
    description,
    details,
    startDate:
      matchLabeledValue(detailText, [
        'Start Date',
        'Date',
        'Begins',
        'Starts',
      ]) || seed.startDate,
    endDate:
      matchLabeledValue(detailText, ['End Date', 'Ends']) || seed.endDate,
    location: locationTexts[0] || seed.location,
    locations: locationTexts.length > 0 ? locationTexts : seed.locations,
    thumbnailImageUrl: thumbnailImageUrl || seed.thumbnailImageUrl,
    url: page.url(),
  };

  event.markdown = buildEventMarkdown(event, detailText.slice(0, 8_000));
  return event;
}

export async function crawlCsaeEvents(
  baseUrl: string,
  page: Page,
): Promise<MemberLoungeEvent[]> {
  const calendarUrl = `${baseUrl.replace(/\/$/, '')}${CSAE_EVENTS_CALENDAR_PATH}`;

  logger.info(`CSAE event step: navigating to calendar page ${calendarUrl}`);

  await page.goto(calendarUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });

  await waitForPageToSettle(page, 'opening calendar page');
  logger.info(`CSAE event step: calendar page loaded at ${page.url()}`);

  const seedEvents = await extractEventsFromCurrentPage(page);
  logger.info(
    `CSAE event step: extracted ${seedEvents.length} event rows from calendar page`,
  );

  const uniqueSeeds = new Map<string, MemberLoungeEvent>();
  for (const event of seedEvents) {
    const key = event.url || event.title;
    if (!uniqueSeeds.has(key)) {
      uniqueSeeds.set(key, event);
    }
  }

  const detailedEvents: MemberLoungeEvent[] = [];
  for (const seed of uniqueSeeds.values()) {
    if (!seed.url) {
      logger.warn(
        `CSAE event step: skipping detail page for event without URL ${seed.title}`,
      );
      seed.markdown = buildEventMarkdown(seed, seed.description || '');
      detailedEvents.push(seed);
      continue;
    }

    try {
      logger.info(`CSAE event step: visiting event detail page ${seed.url}`);
      await page.goto(seed.url, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      });
      await waitForPageToSettle(page, `opening detail page ${seed.url}`);
      detailedEvents.push(await extractEventDetailsFromCurrentPage(page, seed));
      logger.info(`CSAE event step: extracted event detail for ${seed.title}`);
    } catch {
      logger.warn(
        `CSAE event step: failed to load detail page for ${seed.title}, returning seed data`,
      );
      seed.markdown = buildEventMarkdown(seed, seed.description || '');
      detailedEvents.push(seed);
    }
  }

  logger.info(
    `CSAE event step: completed event crawl with ${detailedEvents.length} events from ${baseUrl}`,
  );

  return detailedEvents;
}
