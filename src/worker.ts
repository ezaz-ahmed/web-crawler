import { Worker, Job } from 'bullmq';
import { nanoid } from 'nanoid';
import { redisConnection, enqueueCrawlJob } from './queue.js';
import { jobStateManager } from './jobState.js';
import { crawlSingleUrl } from './crawler/url.js';
import { parseSitemap } from './crawler/sitemap.js';
import { crawlWebsite } from './crawler/website.js';
import { convertToMarkdown, convertPagesToMarkdown } from './ai/processor.js';
import type {
  CrawlJobData,
  UrlJobData,
  WebsiteJobData,
  SitemapJobData,
  SingleUrlResult,
  MultiPageResult,
  Priority,
} from './types.js';
import { dispatchWebhook } from './webhook.js';

/**
 * Process a single URL crawl job
 */
async function processUrlJob(jobData: UrlJobData): Promise<void> {
  console.log(`Processing URL job: ${jobData.jobId}`);

  // Crawl the page
  const pageResult = await crawlSingleUrl(
    jobData.url,
    jobData.includePatterns,
    jobData.excludePatterns,
  );

  // Convert to markdown with AI
  const markdown = await convertToMarkdown(
    pageResult.content,
    pageResult.title,
    pageResult.url,
    jobData.instructions,
  );

  // Create result
  const result: SingleUrlResult = {
    url: pageResult.url,
    title: pageResult.title,
    markdown,
    wordCount: pageResult.wordCount || 0,
    fetchedAt: pageResult.fetchedAt,
  };

  // Store result
  jobStateManager.setJobResult(jobData.jobId, result);
  jobStateManager.updateJobStatus(jobData.jobId, 'completed');
  dispatchWebhook(jobData.callbackUrl, {
    event: 'job.completed',
    jobId: jobData.jobId,
    type: 'url',
    status: 'completed',
    result,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Process a website crawl job
 */
async function processWebsiteJob(jobData: WebsiteJobData): Promise<void> {
  console.log(`Processing website job: ${jobData.jobId}`);

  // Crawl the website
  let lastReportedProgress = -1;
  const pages = await crawlWebsite(
    jobData.url,
    jobData.crawlDepth,
    jobData.maxPages,
    jobData.includePatterns,
    jobData.excludePatterns,
    (current, total) => {
      // Update progress
      const progress = Math.floor((current / total) * 50); // 0-50% for crawling
      jobStateManager.updateJobProgress(jobData.jobId, progress);
      // Emit every 5% boundary
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

  // Convert all pages to markdown
  const markdowns = await convertPagesToMarkdown(
    pages.map((p) => ({
      content: p.content,
      title: p.title,
      url: p.url,
    })),
    jobData.instructions,
    (current, total) => {
      // Update progress (50-90% for AI processing)
      const progress = 50 + Math.floor((current / total) * 40);
      jobStateManager.updateJobProgress(jobData.jobId, progress);
      // Emit every 5% boundary
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

  // Final progress step before assembling response payload
  jobStateManager.updateJobProgress(jobData.jobId, 90);

  // Create result
  const result: MultiPageResult = {
    rootUrl: jobData.url,
    totalPages: pages.length,
    pages: pages.map((page, i) => ({
      url: page.url,
      title: page.title,
      markdown: markdowns[i],
    })),
  };

  // Store result
  jobStateManager.setJobResult(jobData.jobId, result);
  jobStateManager.updateJobProgress(jobData.jobId, 100);
  jobStateManager.updateJobStatus(jobData.jobId, 'completed');
  dispatchWebhook(jobData.callbackUrl, {
    event: 'job.completed',
    jobId: jobData.jobId,
    type: 'website',
    status: 'completed',
    result,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Process a sitemap crawl job
 */
async function processSitemapJob(jobData: SitemapJobData): Promise<void> {
  console.log(`Processing sitemap job: ${jobData.jobId}`);

  // Parse sitemap and get URLs
  const urls = await parseSitemap(
    jobData.sitemapUrl,
    jobData.includePatterns,
    jobData.excludePatterns,
  );

  if (urls.length === 0) {
    throw new Error('No URLs found in sitemap');
  }

  console.log(`Found ${urls.length} URLs in sitemap, enqueueing child jobs...`);

  // Enqueue a separate job for each URL
  const childJobIds: string[] = [];
  for (const url of urls) {
    const childJobId = nanoid();
    childJobIds.push(childJobId);

    // Create job state
    jobStateManager.createJob(childJobId, 'url');

    // Enqueue child job with same priority and instructions
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

  // Mark sitemap job as completed
  // Note: The result for sitemap job could include child job IDs
  // For now, we just complete it
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

  jobStateManager.setJobResult(jobData.jobId, result);
  jobStateManager.updateJobStatus(jobData.jobId, 'completed');
  dispatchWebhook(jobData.callbackUrl, {
    event: 'job.completed',
    jobId: jobData.jobId,
    type: 'sitemap',
    status: 'completed',
    result,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Main job processor
 */
async function processJob(job: Job<CrawlJobData>): Promise<void> {
  const jobData = job.data;

  console.log(`\n========================================`);
  console.log(`Starting job: ${jobData.jobId} (type: ${jobData.type})`);
  console.log(`========================================`);

  // Update status to processing
  jobStateManager.updateJobStatus(jobData.jobId, 'processing');
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
        throw new Error(`Unknown job type: ${(jobData as any).type}`);
    }

    console.log(`✓ Job completed: ${jobData.jobId}`);
  } catch (error) {
    console.error(`✗ Job failed: ${jobData.jobId}`, error);
    jobStateManager.updateJobStatus(
      jobData.jobId,
      'failed',
      (error as Error).message,
    );
    dispatchWebhook(jobData.callbackUrl, {
      event: 'job.failed',
      jobId: jobData.jobId,
      type: jobData.type,
      status: 'failed',
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
    throw error; // Re-throw to let BullMQ handle retry logic
  }
}

// Create workers for each priority queue
const workers: Worker[] = [];

export function startWorkers(): void {
  console.log('Starting workers...');

  // High priority worker
  const highWorker = new Worker<CrawlJobData>('crawl-high', processJob, {
    connection: redisConnection,
    concurrency: 2, // Process 2 high-priority jobs concurrently
    skipVersionCheck: true,
  });

  // Medium priority worker
  const mediumWorker = new Worker<CrawlJobData>('crawl-medium', processJob, {
    connection: redisConnection,
    concurrency: 2,
    skipVersionCheck: true,
  });

  // Low priority worker
  const lowWorker = new Worker<CrawlJobData>('crawl-low', processJob, {
    connection: redisConnection,
    concurrency: 1, // Process 1 low-priority job at a time
    skipVersionCheck: true,
  });

  workers.push(highWorker, mediumWorker, lowWorker);

  // Log worker events
  workers.forEach((worker, index) => {
    const priority = ['high', 'medium', 'low'][index];

    worker.on('completed', (job) => {
      console.log(`[${priority}] Job ${job.id} completed`);
    });

    worker.on('failed', (job, error) => {
      console.error(`[${priority}] Job ${job?.id} failed:`, error.message);
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
