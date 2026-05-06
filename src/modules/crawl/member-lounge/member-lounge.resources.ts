import type { Page } from 'playwright';
import * as cheerio from 'cheerio';
import type { MemberLoungeResource } from '../../../types.js';
import { buildMarkdownByFilename } from './member-lounge.files.js';

interface ExtractedResource {
  title: string;
  description?: string;
  url?: string;
  files: Array<{ name: string; url: string; type: 'pdf' | 'docx' | 'other' }>;
}

async function extractResourcesFromCurrentPage(
  page: Page,
): Promise<ExtractedResource[]> {
  const html = await page.content();
  const $ = cheerio.load(html);
  const resources: ExtractedResource[] = [];

  $('article, .card, .resource-card, li, a').each((_, element) => {
    const node = $(element);
    const text = node.text().trim();

    if (!text || !/resource|download|document|pdf|docx/i.test(text)) {
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

        return {
          name,
          url: linkUrl,
          type,
        };
      })
      .filter((item) => item.url.length > 0);

    resources.push({
      title,
      description: text.slice(0, 500),
      url: href,
      files: fileLinks,
    });
  });

  const deduped = new Map<string, ExtractedResource>();
  for (const item of resources) {
    const key = item.url || item.title;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return Array.from(deduped.values());
}

function normalizeKey(value: string | undefined): string {
  return (value || '').trim().toLowerCase();
}

export async function crawlResources(
  baseUrl: string,
  page: Page,
  instructions?: string,
): Promise<MemberLoungeResource[]> {
  await page.goto(`${baseUrl}/resources`, {
    waitUntil: 'domcontentloaded',
  });
  const resources = await extractResourcesFromCurrentPage(page);

  await page.goto(`${baseUrl}/resources/my-purchased-resources`, {
    waitUntil: 'domcontentloaded',
  });
  const purchased = await extractResourcesFromCurrentPage(page);

  const purchasedLookup = new Set(
    purchased.flatMap((item) => [
      normalizeKey(item.title),
      normalizeKey(item.url),
    ]),
  );

  const result: MemberLoungeResource[] = [];

  for (const resource of resources) {
    const isPurchased =
      purchasedLookup.has(normalizeKey(resource.title)) ||
      purchasedLookup.has(normalizeKey(resource.url));

    const fileMarkdownByName = await buildMarkdownByFilename(
      page.context(),
      resource.files.map((file) => ({ name: file.name, url: file.url })),
      instructions,
    );

    result.push({
      title: resource.title,
      description: resource.description,
      url: resource.url,
      isPurchased,
      files: resource.files,
      fileMarkdownByName,
    });
  }

  return result;
}

export async function crawlAdminResources(
  baseUrl: string,
  page: Page,
  instructions?: string,
): Promise<MemberLoungeResource[]> {
  await page.goto(`${baseUrl}/resources/admin-resources`, {
    waitUntil: 'domcontentloaded',
  });

  const resources = await extractResourcesFromCurrentPage(page);
  const mapped: MemberLoungeResource[] = [];

  for (const resource of resources) {
    const fileMarkdownByName = await buildMarkdownByFilename(
      page.context(),
      resource.files.map((file) => ({ name: file.name, url: file.url })),
      instructions,
    );

    mapped.push({
      title: resource.title,
      description: resource.description,
      url: resource.url,
      isPurchased: false,
      files: resource.files,
      fileMarkdownByName,
    });
  }

  return mapped;
}
