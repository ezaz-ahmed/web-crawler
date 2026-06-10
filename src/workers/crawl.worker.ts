import { Job, Worker } from 'bullmq';
import { nanoid } from 'nanoid';
import { enqueueCrawlJob } from '../queue.js';
import { redisConnection } from '../plugins/redis.js';
import type {
  CrawlJobData,
  CsaeJobData,
  MemberLoungeJobData,
  MultiPageResult,
  Priority,
  SitemapJobData,
  SingleUrlResult,
  UrlJobData,
  WebsiteJobData,
} from '../types.js';
import { parseSitemap } from '../modules/crawl/crawlers/sitemap.js';
import { crawlSingleUrl } from '../modules/crawl/crawlers/single-url.js';
import { crawlWebsite } from '../modules/crawl/crawlers/website.js';
import { crawlMemberLounge } from '../modules/crawl/member-lounge/member-lounge.crawler.js';
import { crawlCsae } from '../modules/crawl/csae/csae.crawler.js';
import {
  convertPagesToMarkdown,
  convertToMarkdown,
} from '../modules/crawl/processor.js';
import {
  createJobState,
  setJobResult,
  updateJobProgress,
  updateJobStatus,
} from '../modules/crawl/job.js';
import { dispatchWebhook } from '../modules/crawl/webhook.js';
import { logger } from '../utils/logger.js';

async function processUrlJob(jobData: UrlJobData): Promise<void> {
  logger.info(`Processing URL job: ${jobData.jobId}`);

  const pageResult = await crawlSingleUrl(
    jobData.url,
    jobData.includePatterns,
    jobData.excludePatterns,
  );

  const markdown = await convertToMarkdown(
    pageResult.content,
    pageResult.title,
    pageResult.url,
    jobData.instructions,
  );

  const result: SingleUrlResult = {
    url: pageResult.url,
    title: pageResult.title,
    markdown,
    wordCount: pageResult.wordCount || 0,
    fetchedAt: pageResult.fetchedAt,
  };

  await setJobResult(jobData.jobId, result);
  await updateJobStatus(jobData.jobId, 'completed');
  dispatchWebhook(
    jobData.callbackUrl,
    {
      event: 'job.completed',
      jobId: jobData.jobId,
      type: 'url',
      status: 'completed',
      result,
      timestamp: new Date().toISOString(),
    },
    jobData.webhookSecret,
  );
}

async function processWebsiteJob(jobData: WebsiteJobData): Promise<void> {
  logger.info(`Processing website job: ${jobData.jobId}`);

  let lastReportedProgress = -1;
  const pages = await crawlWebsite(
    jobData.url,
    jobData.crawlDepth,
    jobData.maxPages,
    jobData.includePatterns,
    jobData.excludePatterns,
    (current, total) => {
      const progress = Math.floor((current / total) * 50);
      void updateJobProgress(jobData.jobId, progress);

      const bucket = Math.floor(progress / 5) * 5;
      if (bucket > lastReportedProgress) {
        lastReportedProgress = bucket;
        dispatchWebhook(
          jobData.callbackUrl,
          {
            event: 'job.progress',
            jobId: jobData.jobId,
            type: 'website',
            status: 'processing',
            progress,
            timestamp: new Date().toISOString(),
          },
          jobData.webhookSecret,
        );
      }
    },
  );

  if (pages.length === 0) {
    throw new Error('No pages crawled');
  }

  logger.info(`Converting ${pages.length} pages to markdown...`);

  const markdowns = await convertPagesToMarkdown(
    pages.map((p) => ({
      content: p.content,
      title: p.title,
      url: p.url,
    })),
    jobData.instructions,
    (current, total) => {
      const progress = 50 + Math.floor((current / total) * 40);
      void updateJobProgress(jobData.jobId, progress);

      const bucket = Math.floor(progress / 5) * 5;
      if (bucket > lastReportedProgress) {
        lastReportedProgress = bucket;
        dispatchWebhook(
          jobData.callbackUrl,
          {
            event: 'job.progress',
            jobId: jobData.jobId,
            type: 'website',
            status: 'processing',
            progress,
            timestamp: new Date().toISOString(),
          },
          jobData.webhookSecret,
        );
      }
    },
  );

  await updateJobProgress(jobData.jobId, 90);

  const result: MultiPageResult = {
    rootUrl: jobData.url,
    totalPages: pages.length,
    pages: pages.map((page, i) => ({
      url: page.url,
      title: page.title,
      markdown: markdowns[i],
    })),
  };

  await setJobResult(jobData.jobId, result);
  await updateJobProgress(jobData.jobId, 100);
  await updateJobStatus(jobData.jobId, 'completed');
  dispatchWebhook(
    jobData.callbackUrl,
    {
      event: 'job.completed',
      jobId: jobData.jobId,
      type: 'website',
      status: 'completed',
      result,
      timestamp: new Date().toISOString(),
    },
    jobData.webhookSecret,
  );
}

async function processSitemapJob(jobData: SitemapJobData): Promise<void> {
  logger.info(`Processing sitemap job: ${jobData.jobId}`);

  const urls = await parseSitemap(
    jobData.sitemapUrl,
    jobData.includePatterns,
    jobData.excludePatterns,
  );

  if (urls.length === 0) {
    throw new Error('No URLs found in sitemap');
  }

  logger.info(`Found ${urls.length} URLs in sitemap, enqueueing child jobs...`);

  for (const url of urls) {
    const childJobId = nanoid();

    await createJobState(childJobId, 'url');

    await enqueueCrawlJob(
      {
        type: 'url',
        jobId: childJobId,
        url,
        priority: jobData.priority,
        instructions: jobData.instructions,
        includePatterns: jobData.includePatterns,
        excludePatterns: jobData.excludePatterns,
        createdAt: new Date(),
      },
      (jobData.priority as Priority) || 'medium',
    );
  }

  const result: MultiPageResult = {
    rootUrl: jobData.sitemapUrl,
    totalPages: urls.length,
    pages: urls.map((url) => ({
      url,
      title: 'Pending',
      markdown:
        'Pending - check spawned URL child jobs for completed markdown.',
    })),
  };

  await setJobResult(jobData.jobId, result);
  await updateJobStatus(jobData.jobId, 'completed');
  dispatchWebhook(
    jobData.callbackUrl,
    {
      event: 'job.completed',
      jobId: jobData.jobId,
      type: 'sitemap',
      status: 'completed',
      result,
      timestamp: new Date().toISOString(),
    },
    jobData.webhookSecret,
  );
}

async function processMemberLoungeJob(
  jobData: MemberLoungeJobData,
): Promise<void> {
  logger.info(
    { jobId: jobData.jobId, url: jobData.memberLoungeUrl, kind: jobData.crawlKind },
    `Processing member lounge job: ${jobData.jobId} url=${jobData.memberLoungeUrl} kind=${jobData.crawlKind}`,
  );

  await updateJobProgress(jobData.jobId, 10);
  dispatchWebhook(
    jobData.callbackUrl,
    {
      event: 'job.progress',
      jobId: jobData.jobId,
      type: 'member-lounge',
      status: 'processing',
      progress: 10,
      timestamp: new Date().toISOString(),
    },
    jobData.webhookSecret,
  );

  const result = await crawlMemberLounge({
    memberLoungeUrl: jobData.memberLoungeUrl,
    email: jobData.email,
    password: jobData.password,
    crawlKind: jobData.crawlKind,
    instructions: jobData.instructions,
  });

  await updateJobProgress(jobData.jobId, 90);

  await setJobResult(jobData.jobId, result);
  await updateJobProgress(jobData.jobId, 100);
  await updateJobStatus(jobData.jobId, 'completed');

  dispatchWebhook(
    jobData.callbackUrl,
    {
      event: 'job.completed',
      jobId: jobData.jobId,
      type: 'member-lounge',
      status: 'completed',
      result,
      timestamp: new Date().toISOString(),
    },
    jobData.webhookSecret,
  );
}

async function processCsaeJob(jobData: CsaeJobData): Promise<void> {
  logger.info(`Processing CSAE job: ${jobData.jobId}`);

  await updateJobProgress(jobData.jobId, 10);
  dispatchWebhook(
    jobData.callbackUrl,
    {
      event: 'job.progress',
      jobId: jobData.jobId,
      type: 'csae',
      status: 'processing',
      progress: 10,
      timestamp: new Date().toISOString(),
    },
    jobData.webhookSecret,
  );

  const result = await crawlCsae({
    csaeUrl: jobData.csaeUrl,
    email: jobData.email,
    password: jobData.password,
    crawlKind: jobData.crawlKind,
    instructions: jobData.instructions,
  });

  await updateJobProgress(jobData.jobId, 90);
  await setJobResult(jobData.jobId, result);
  await updateJobProgress(jobData.jobId, 100);
  await updateJobStatus(jobData.jobId, 'completed');

  dispatchWebhook(
    jobData.callbackUrl,
    {
      event: 'job.completed',
      jobId: jobData.jobId,
      type: 'csae',
      status: 'completed',
      result,
      timestamp: new Date().toISOString(),
    },
    jobData.webhookSecret,
  );
}

async function processJob(job: Job<CrawlJobData>): Promise<void> {
  const jobData = job.data;

  logger.info(`\n========================================`);
  logger.info(`Starting job: ${jobData.jobId} (type: ${jobData.type})`);
  logger.info(`========================================`);

  await updateJobStatus(jobData.jobId, 'processing');
  dispatchWebhook(
    jobData.callbackUrl,
    {
      event: 'job.processing',
      jobId: jobData.jobId,
      type: jobData.type,
      status: 'processing',
      timestamp: new Date().toISOString(),
    },
    jobData.webhookSecret,
  );

  try {
    switch (jobData.type) {
      case 'url':
        await processUrlJob(jobData as UrlJobData);
        break;
      case 'website':
        await processWebsiteJob(jobData as WebsiteJobData);
        break;
      case 'sitemap':
        await processSitemapJob(jobData as SitemapJobData);
        break;
      case 'member-lounge':
        await processMemberLoungeJob(jobData as MemberLoungeJobData);
        break;
      case 'csae':
        await processCsaeJob(jobData as CsaeJobData);
        break;
      default:
        throw new Error(
          `Unknown job type: ${(jobData as { type: string }).type}`,
        );
    }

    logger.info(`✓ Job completed: ${jobData.jobId}`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    const jobContext: Record<string, unknown> = {
      jobId: jobData.jobId,
      type: jobData.type,
      error: errMsg,
      stack: errStack,
    };

    if (jobData.type === 'member-lounge') {
      const mlData = jobData as MemberLoungeJobData;
      jobContext.url = mlData.memberLoungeUrl;
      jobContext.crawlKind = mlData.crawlKind;
      jobContext.email = mlData.email;
    } else if (jobData.type === 'url') {
      jobContext.url = (jobData as UrlJobData).url;
    } else if (jobData.type === 'website') {
      jobContext.url = (jobData as WebsiteJobData).url;
    } else if (jobData.type === 'sitemap') {
      jobContext.url = (jobData as SitemapJobData).sitemapUrl;
    } else if (jobData.type === 'csae') {
      const csaeData = jobData as CsaeJobData;
      jobContext.url = csaeData.csaeUrl;
      jobContext.crawlKind = csaeData.crawlKind;
    }

    logger.error(jobContext, `✗ Job failed: ${jobData.jobId} type=${jobData.type}: ${errMsg}`);

    await updateJobStatus(jobData.jobId, 'failed', errMsg);
    dispatchWebhook(
      jobData.callbackUrl,
      {
        event: 'job.failed',
        jobId: jobData.jobId,
        type: jobData.type,
        status: 'failed',
        error: errMsg,
        timestamp: new Date().toISOString(),
      },
      jobData.webhookSecret,
    );
    throw error;
  }
}

const workers: Worker[] = [];

export function startWorkers(): void {
  logger.info('Starting workers...');

  const highWorker = new Worker<CrawlJobData>('crawl-high', processJob, {
    connection: redisConnection,
    concurrency: 2,
    skipVersionCheck: true,
    lockDuration: 5 * 60 * 1000, // 5 min
    lockRenewTime: 60 * 1000,    // renew every 1 min
  });

  const mediumWorker = new Worker<CrawlJobData>('crawl-medium', processJob, {
    connection: redisConnection,
    concurrency: 2,
    skipVersionCheck: true,
    lockDuration: 10 * 60 * 1000, // 10 min for large AI conversions
    lockRenewTime: 2 * 60 * 1000, // renew every 2 min
  });

  const lowWorker = new Worker<CrawlJobData>('crawl-low', processJob, {
    connection: redisConnection,
    concurrency: 1,
    skipVersionCheck: true,
    lockDuration: 10 * 60 * 1000,
    lockRenewTime: 2 * 60 * 1000,
  });

  workers.push(highWorker, mediumWorker, lowWorker);

  workers.forEach((worker, index) => {
    const priority = ['high', 'medium', 'low'][index];

    worker.on('completed', (completedJob) => {
      logger.info(`[${priority}] Job ${completedJob.id} completed`);
    });

    worker.on('failed', (failedJob, error) => {
      logger.error(
        { priority, jobId: failedJob?.id, error: error.message, stack: error.stack },
        `[${priority}] Job ${failedJob?.id} failed: ${error.message}`,
      );
    });

    worker.on('error', (error) => {
      logger.error(
        { priority, error: error.message, stack: error.stack },
        `[${priority}] Worker connection/internal error: ${error.message}`,
      );
    });
  });

  logger.info('✓ Workers started (high: 2, medium: 2, low: 1 concurrency)');
}

export async function stopWorkers(): Promise<void> {
  logger.info('Stopping workers...');
  await Promise.all(workers.map((worker) => worker.close()));
  logger.info('✓ Workers stopped');
}
