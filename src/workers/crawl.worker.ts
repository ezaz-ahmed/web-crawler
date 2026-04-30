import { Job, Worker } from 'bullmq';
import { nanoid } from 'nanoid';
import { enqueueCrawlJob } from '../queue.js';
import { redisConnection } from '../plugins/redis.js';
import type {
  CrawlJobData,
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

async function processUrlJob(jobData: UrlJobData): Promise<void> {
  console.log(`Processing URL job: ${jobData.jobId}`);

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

  setJobResult(jobData.jobId, result);
  updateJobStatus(jobData.jobId, 'completed');
  dispatchWebhook(jobData.callbackUrl, {
    event: 'job.completed',
    jobId: jobData.jobId,
    type: 'url',
    status: 'completed',
    result,
    timestamp: new Date().toISOString(),
  });
}

async function processWebsiteJob(jobData: WebsiteJobData): Promise<void> {
  console.log(`Processing website job: ${jobData.jobId}`);

  let lastReportedProgress = -1;
  const pages = await crawlWebsite(
    jobData.url,
    jobData.crawlDepth,
    jobData.maxPages,
    jobData.includePatterns,
    jobData.excludePatterns,
    (current, total) => {
      const progress = Math.floor((current / total) * 50);
      updateJobProgress(jobData.jobId, progress);

      const bucket = Math.floor(progress / 5) * 5;
      if (bucket > lastReportedProgress) {
        lastReportedProgress = bucket;
        dispatchWebhook(jobData.callbackUrl, {
          event: 'job.progress',
          jobId: jobData.jobId,
          type: 'website',
          status: 'processing',
          progress,
          timestamp: new Date().toISOString(),
        });
      }
    },
  );

  if (pages.length === 0) {
    throw new Error('No pages crawled');
  }

  console.log(`Converting ${pages.length} pages to markdown...`);

  const markdowns = await convertPagesToMarkdown(
    pages.map((p) => ({
      content: p.content,
      title: p.title,
      url: p.url,
    })),
    jobData.instructions,
    (current, total) => {
      const progress = 50 + Math.floor((current / total) * 40);
      updateJobProgress(jobData.jobId, progress);

      const bucket = Math.floor(progress / 5) * 5;
      if (bucket > lastReportedProgress) {
        lastReportedProgress = bucket;
        dispatchWebhook(jobData.callbackUrl, {
          event: 'job.progress',
          jobId: jobData.jobId,
          type: 'website',
          status: 'processing',
          progress,
          timestamp: new Date().toISOString(),
        });
      }
    },
  );

  updateJobProgress(jobData.jobId, 90);

  const result: MultiPageResult = {
    rootUrl: jobData.url,
    totalPages: pages.length,
    pages: pages.map((page, i) => ({
      url: page.url,
      title: page.title,
      markdown: markdowns[i],
    })),
  };

  setJobResult(jobData.jobId, result);
  updateJobProgress(jobData.jobId, 100);
  updateJobStatus(jobData.jobId, 'completed');
  dispatchWebhook(jobData.callbackUrl, {
    event: 'job.completed',
    jobId: jobData.jobId,
    type: 'website',
    status: 'completed',
    result,
    timestamp: new Date().toISOString(),
  });
}

async function processSitemapJob(jobData: SitemapJobData): Promise<void> {
  console.log(`Processing sitemap job: ${jobData.jobId}`);

  const urls = await parseSitemap(
    jobData.sitemapUrl,
    jobData.includePatterns,
    jobData.excludePatterns,
  );

  if (urls.length === 0) {
    throw new Error('No URLs found in sitemap');
  }

  console.log(`Found ${urls.length} URLs in sitemap, enqueueing child jobs...`);

  for (const url of urls) {
    const childJobId = nanoid();

    createJobState(childJobId, 'url');

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

  setJobResult(jobData.jobId, result);
  updateJobStatus(jobData.jobId, 'completed');
  dispatchWebhook(jobData.callbackUrl, {
    event: 'job.completed',
    jobId: jobData.jobId,
    type: 'sitemap',
    status: 'completed',
    result,
    timestamp: new Date().toISOString(),
  });
}

async function processJob(job: Job<CrawlJobData>): Promise<void> {
  const jobData = job.data;

  console.log(`\n========================================`);
  console.log(`Starting job: ${jobData.jobId} (type: ${jobData.type})`);
  console.log(`========================================`);

  updateJobStatus(jobData.jobId, 'processing');
  dispatchWebhook(jobData.callbackUrl, {
    event: 'job.processing',
    jobId: jobData.jobId,
    type: jobData.type,
    status: 'processing',
    timestamp: new Date().toISOString(),
  });

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
      default:
        throw new Error(
          `Unknown job type: ${(jobData as { type: string }).type}`,
        );
    }

    console.log(`✓ Job completed: ${jobData.jobId}`);
  } catch (error) {
    console.error(`✗ Job failed: ${jobData.jobId}`, error);
    updateJobStatus(jobData.jobId, 'failed', (error as Error).message);
    dispatchWebhook(jobData.callbackUrl, {
      event: 'job.failed',
      jobId: jobData.jobId,
      type: jobData.type,
      status: 'failed',
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}

const workers: Worker[] = [];

export function startWorkers(): void {
  console.log('Starting workers...');

  const highWorker = new Worker<CrawlJobData>('crawl-high', processJob, {
    connection: redisConnection,
    concurrency: 2,
    skipVersionCheck: true,
  });

  const mediumWorker = new Worker<CrawlJobData>('crawl-medium', processJob, {
    connection: redisConnection,
    concurrency: 2,
    skipVersionCheck: true,
  });

  const lowWorker = new Worker<CrawlJobData>('crawl-low', processJob, {
    connection: redisConnection,
    concurrency: 1,
    skipVersionCheck: true,
  });

  workers.push(highWorker, mediumWorker, lowWorker);

  workers.forEach((worker, index) => {
    const priority = ['high', 'medium', 'low'][index];

    worker.on('completed', (completedJob) => {
      console.log(`[${priority}] Job ${completedJob.id} completed`);
    });

    worker.on('failed', (failedJob, error) => {
      console.error(
        `[${priority}] Job ${failedJob?.id} failed:`,
        error.message,
      );
    });

    worker.on('error', (error) => {
      console.error(`[${priority}] Worker error:`, error);
    });
  });

  console.log('✓ Workers started (high: 2, medium: 2, low: 1 concurrency)');
}

export async function stopWorkers(): Promise<void> {
  console.log('Stopping workers...');
  await Promise.all(workers.map((worker) => worker.close()));
  console.log('✓ Workers stopped');
}
