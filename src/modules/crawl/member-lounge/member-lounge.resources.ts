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

async function fetchResourcePage(
  url: string,
  authToken: string,
): Promise<ApiResource[]> {
  let data: unknown;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!res.ok) {
      logger.warn(
        `fetchResourcePage failed for ${url}: HTTP ${res.status} ${res.statusText}`,
      );
      return [];
    }

    data = await res.json();
  } catch (err) {
    logger.warn(
      `fetchResourcePage error for ${url}: ${(err as Error).message}`,
    );
    return [];
  }

  if (Array.isArray(data)) {
    if (
      data.length > 0 &&
      data.some(
        (item) =>
          item &&
          typeof item === 'object' &&
          Array.isArray((item as Record<string, unknown>)['resources']),
      )
    ) {
      const categories = data as Record<string, unknown>[];
      return categories.flatMap((item) => {
        const r = item['resources'];
        return Array.isArray(r) ? (r as ApiResource[]) : [];
      });
    }

    console.log(`Fetched ${data.length} resources from ${url}`);

    return data as ApiResource[];
  }

  return [];
}

async function fetchAllFromApi(
  baseUrl: string,
  apiPath: string,
  authToken: string,
): Promise<ApiResource[]> {
  const all: ApiResource[] = [];
  const seen = new Set<string>();
  let page = -1;

  while (true) {
    const pageUrl = `${baseUrl}${apiPath}?after=${page}`;

    console.log(`📖 Fetching resource page: ${pageUrl}`);

    const batch = await fetchResourcePage(pageUrl, authToken);
    console.log(`📖 Fetched ${batch.length} resources from page ${page}`);
    if (!batch.length) break;

    let addedAny = false;
    for (const resource of batch) {
      if (!seen.has(resource._id)) {
        seen.add(resource._id);
        all.push(resource);
        addedAny = true;
      }
    }

    if (!addedAny) break;
    page++;
  }

  return all;
}

async function buildResourceEntry(
  baseUrl: string,
  resource: ApiResource,
  isPurchased: boolean,
  instructions?: string,
): Promise<MemberLoungeResource> {
  const details = resource.postDetails;
  const downloads = details?.downloads ?? [];

  const downloadFiles = downloads.map((d) => ({
    name: getFileName(d),
    url: d.url,
  }));

  const fileMarkdownByName = await buildMarkdownByFilename(
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
        instructions,
      ),
    );
  }

  return result;
}
