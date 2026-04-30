import { nanoid } from 'nanoid';
import { enqueueCrawlJob } from '../../queue.js';
import type {
  EnqueueResponse,
  Priority,
  SitemapCrawlRequest,
  StatusResponse,
  UrlCrawlRequest,
  WebsiteCrawlRequest,
} from '../../types.js';
import { createJobState, getJobStatus } from './job.js';
import { dispatchWebhook } from './webhook.js';

function estimateTime(
  type: 'url' | 'website' | 'sitemap',
  params: unknown,
): string {
  if (type === 'url') {
    return '1-2 minutes';
  }

  if (type === 'website') {
    const websiteParams = params as WebsiteCrawlRequest;
    const pages = websiteParams.maxPages || 10;
    const minutes = Math.ceil(pages / 2);
    return `${minutes}-${minutes * 2} minutes`;
  }

  return '5-10 minutes';
}

export async function enqueueUrlCrawl(
  body: UrlCrawlRequest,
): Promise<EnqueueResponse> {
  const jobId = nanoid();

  createJobState(jobId, 'url');

  await enqueueCrawlJob(
    {
      type: 'url',
      jobId,
      url: body.url,
      priority: body.priority,
      instructions: body.instructions,
      includePatterns: body.includePatterns,
      excludePatterns: body.excludePatterns,
      callbackUrl: body.callbackUrl,
      createdAt: new Date(),
    },
    body.priority as Priority,
  );

  dispatchWebhook(body.callbackUrl, {
    event: 'job.queued',
    jobId,
    type: 'url',
    status: 'queued',
    timestamp: new Date().toISOString(),
  });

  return {
    jobId,
    status: 'queued',
    estimatedTime: estimateTime('url', body),
  };
}

export async function enqueueWebsiteCrawl(
  body: WebsiteCrawlRequest,
): Promise<EnqueueResponse> {
  const jobId = nanoid();

  createJobState(jobId, 'website');

  await enqueueCrawlJob(
    {
      type: 'website',
      jobId,
      url: body.url,
      crawlDepth: body.crawlDepth,
      maxPages: body.maxPages,
      priority: body.priority,
      instructions: body.instructions,
      includePatterns: body.includePatterns,
      excludePatterns: body.excludePatterns,
      callbackUrl: body.callbackUrl,
      createdAt: new Date(),
    },
    body.priority as Priority,
  );

  dispatchWebhook(body.callbackUrl, {
    event: 'job.queued',
    jobId,
    type: 'website',
    status: 'queued',
    timestamp: new Date().toISOString(),
  });

  return {
    jobId,
    status: 'queued',
    estimatedTime: estimateTime('website', body),
  };
}

export async function enqueueSitemapCrawl(
  body: SitemapCrawlRequest,
): Promise<EnqueueResponse> {
  const jobId = nanoid();

  createJobState(jobId, 'sitemap');

  await enqueueCrawlJob(
    {
      type: 'sitemap',
      jobId,
      sitemapUrl: body.sitemapUrl,
      priority: body.priority,
      instructions: body.instructions,
      includePatterns: body.includePatterns,
      excludePatterns: body.excludePatterns,
      callbackUrl: body.callbackUrl,
      createdAt: new Date(),
    },
    body.priority as Priority,
  );

  dispatchWebhook(body.callbackUrl, {
    event: 'job.queued',
    jobId,
    type: 'sitemap',
    status: 'queued',
    timestamp: new Date().toISOString(),
  });

  return {
    jobId,
    status: 'queued',
    estimatedTime: estimateTime('sitemap', body),
  };
}

export function getCrawlStatus(jobId: string): StatusResponse | null {
  const jobState = getJobStatus(jobId);

  if (!jobState) {
    return null;
  }

  return {
    jobId: jobState.jobId,
    status: jobState.status,
    progress: jobState.progress,
    result: jobState.result,
    error: jobState.error,
    createdAt: jobState.createdAt,
    completedAt: jobState.completedAt,
  };
}
