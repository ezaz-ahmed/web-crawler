import type { MemberLoungeResource } from '../../../types.js';
import { buildMarkdownByFilename } from './member-lounge.files.js';
import { logger } from '../../../utils/logger.js';

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

interface FetchPageResult {
  resources: ApiResource[];
  lastRawId: string | null;
}

async function fetchResourcePage(
  url: string,
  authToken: string,
): Promise<FetchPageResult> {
  let data: unknown;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!res.ok) {
      logger.warn(`fetchResourcePage failed for ${url}: HTTP ${res.status} ${res.statusText}`);
      return { resources: [], lastRawId: null };
    }

    data = await res.json();
  } catch (err) {
    logger.warn(`fetchResourcePage error for ${url}: ${(err as Error).message}`);
    return { resources: [], lastRawId: null };
  }

  console.log(
    `👉 fetchResourcePage ${url} raw data:`,
    JSON.stringify(data).slice(0, 500),
  );

  if (Array.isArray(data)) {
    console.log(`Data`, JSON.stringify(data, null, 2));

    data.forEach((item, index) => {
      if (Array.isArray(item.resources)) {
        console.log(`✨✨
            ✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨ Object ${index}: ${item.resources.length}`);
      }
    });

    if (
      data.length > 0 &&
      data.some(
        (item) =>
          item &&
          typeof item === 'object' &&
          Array.isArray((item as Record<string, unknown>)['resources']),
      )
    ) {
      console.log(
        `Data is array of objects with 'resources' array, extracting...`,
      );

      const categories = data as Record<string, unknown>[];
      const resources = categories.flatMap((item) => {
        const r = item['resources'];
        return Array.isArray(r) ? (r as ApiResource[]) : [];
      });
      const lastRawId =
        (categories[categories.length - 1]['_id'] as string) ?? null;
      return { resources, lastRawId };
    }
    const resources = data as ApiResource[];
    const lastRawId =
      resources.length > 0 ? resources[resources.length - 1]._id : null;
    return { resources, lastRawId };
  }

  console.log(
    `⚠️ fetchResourcePage ${url}: unrecognized shape`,
    JSON.stringify(data).slice(0, 300),
  );
  return { resources: [], lastRawId: null };
}

async function fetchAllFromApi(
  baseUrl: string,
  apiPath: string,
  authToken: string,
): Promise<ApiResource[]> {
  const all: ApiResource[] = [];
  let after = '-1';

  while (true) {
    const pageUrl = `${baseUrl}${apiPath}?after=${after}`;

    console.log(`🚀 Fetching resources from API: ${pageUrl}`);

    const { resources: batch, lastRawId } = await fetchResourcePage(
      pageUrl,
      authToken,
    );

    console.log(
      `🔥🔥🔥 Fetched ${batch.length} resources from ${pageUrl}`,
      batch.map((r) => r._id),
    );

    if (!batch.length || !lastRawId || lastRawId === after) break;
    all.push(...batch);
    after = lastRawId;
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
  authToken: string,
  instructions?: string,
): Promise<MemberLoungeResource> {
  const details = resource.postDetails;
  const downloads = details?.downloads ?? [];

  const downloadFiles = downloads.map((d) => ({
    name: getFileName(d),
    url: d.url,
  }));

  const fileMarkdownByName = await buildMarkdownByFilename(
    authToken,
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
  authToken: string,
  instructions?: string,
): Promise<MemberLoungeResource[]> {
  const allResources = await fetchAllFromApi(
    baseUrl,
    '/api/post/resources/gallery/page',
    authToken,
  );

  const purchasedIds = new Set(allResources.map((r) => r._id));

  const result: MemberLoungeResource[] = [];

  for (const resource of allResources) {
    result.push(
      await buildResourceEntry(
        baseUrl,
        resource,
        purchasedIds.has(resource._id),
        authToken,
        instructions,
      ),
    );
  }

  console.log(`✅ Built resource entries with file markdown`, result);

  return result;
}

export async function crawlAdminResources(
  baseUrl: string,
  authToken: string,
  instructions?: string,
): Promise<MemberLoungeResource[]> {
  const resources = await fetchAllFromApi(
    baseUrl,
    '/api/post/resources/admin-resources/gallery/page',
    authToken,
  );

  const result: MemberLoungeResource[] = [];

  for (const resource of resources) {
    result.push(
      await buildResourceEntry(baseUrl, resource, false, authToken, instructions),
    );
  }

  return result;
}
