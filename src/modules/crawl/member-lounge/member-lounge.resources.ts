import type { Page } from 'puppeteer';
import type { MemberLoungeResource } from '../../../types.js';
import { buildMarkdownByFilename } from './member-lounge.files.js';

interface ApiBanner {
  url: string;
  size: number;
  name: string;
  title?: string;
}

interface ApiPostDetails {
  title?: string;
  description?: null | string;
  downloads?: ApiBanner[];
  permalink?: string;
  resourceType?: string;
  membersOnly?: boolean;
}

interface ApiResource {
  _id: string;
  postTitle?: string;
  permissionGroupIds?: string[];
  resourceType?: string;
  postDetails?: ApiPostDetails;
}

function getFileName(banner: ApiBanner): string {
  return banner.name || banner.title || banner.url.split('/').pop() || 'file';
}

function normalizeFileType(url: string): 'pdf' | 'docx' | 'other' {
  const lower = url.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'docx';
  return 'other';
}

async function fetchResourcePage(
  page: Page,
  url: string,
): Promise<ApiResource[]> {
  return page.evaluate(async (apiUrl: string) => {
    const res = await fetch(apiUrl, { credentials: 'include' });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;

    console.log(`👉👉👉 Fetched data from ${apiUrl}:`, data);

    // Handle array wrapper: [{ resources: [...], ... }]
    if (Array.isArray(data)) {
      if (
        data.length > 0 &&
        Array.isArray((data[0] as Record<string, unknown>)['resources'])
      ) {
        return (data[0] as Record<string, unknown>)['resources'] as unknown[];
      }
      return data;
    }

    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      const list = obj['resources'] ?? obj['data'];
      if (Array.isArray(list)) return list;
    }

    return [];
  }, url);
}

async function fetchAllFromApi(
  page: Page,
  baseUrl: string,
  apiPath: string,
): Promise<ApiResource[]> {
  const all: ApiResource[] = [];
  let after = '-1';

  while (true) {
    const pageUrl = `${baseUrl}${apiPath}?after=${after}`;
    console.log(`✨✨✨ Fetching resources from: ${pageUrl}`);

    const batch = await fetchResourcePage(page, pageUrl);

    console.log(
      `🔥🔥🔥 Fetched ${batch.length} resources from ${pageUrl}`,
      batch.map((r) => r._id),
    );

    if (!batch.length) break;
    all.push(...batch);
    after = batch[batch.length - 1]._id;
  }

  console.log(
    `✅ Completed fetching all resources from ${apiPath}. Total: ${all.length}`,
  );

  return all;
}

async function buildResourceEntry(
  baseUrl: string,
  resource: ApiResource,
  isPurchased: boolean,
  page: Page,
  instructions?: string,
): Promise<MemberLoungeResource> {
  const details = resource.postDetails;
  const downloads = details?.downloads ?? [];

  const downloadFiles = downloads.map((d) => ({
    name: getFileName(d),
    url: d.url,
  }));

  const fileMarkdownByName = await buildMarkdownByFilename(
    page,
    downloadFiles,
    instructions,
  );

  const files = downloads.map((d) => {
    const name = getFileName(d);
    return {
      name,
      url: d.url,
      type: normalizeFileType(d.url),
      markdown: fileMarkdownByName[name],
    };
  });

  const permalink = details?.permalink;
  const url = permalink
    ? permalink.startsWith('http')
      ? permalink
      : `${baseUrl}/resources/${permalink}`
    : undefined;

  return {
    id: resource._id,
    title: details?.title ?? resource.postTitle ?? 'Untitled',
    description: details?.description ?? undefined,
    url,
    isPurchased,
    files,
    fileMarkdownByName,
  };
}

export async function crawlResources(
  baseUrl: string,
  page: Page,
  instructions?: string,
): Promise<MemberLoungeResource[]> {
  const allResources = await fetchAllFromApi(
    page,
    baseUrl,
    '/api/post/resources/gallery/page',
  );

  console.log(
    `🔥🔥🔥 Fetched ${allResources.length} total resources from gallery endpoint`,
  );

  const purchasedIds = new Set(allResources.map((r) => r._id));

  console.log(
    `🔍 Identified ${purchasedIds.size} purchased resources`,
    Array.from(purchasedIds),
  );

  const result: MemberLoungeResource[] = [];

  for (const resource of allResources) {
    result.push(
      await buildResourceEntry(
        baseUrl,
        resource,
        purchasedIds.has(resource._id),
        page,
        instructions,
      ),
    );
  }

  console.log(`✅ Built resource entries with file markdown`, result);

  return result;
}

export async function crawlAdminResources(
  baseUrl: string,
  page: Page,
  instructions?: string,
): Promise<MemberLoungeResource[]> {
  const resources = await fetchAllFromApi(
    page,
    baseUrl,
    '/api/post/resources/admin-resources/gallery/page',
  );

  const result: MemberLoungeResource[] = [];

  for (const resource of resources) {
    result.push(
      await buildResourceEntry(baseUrl, resource, false, page, instructions),
    );
  }

  return result;
}
