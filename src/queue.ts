import { Queue, QueueOptions } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config.js';
import type { CrawlJobData, Priority } from './types.js';

// Create Redis connection
export const redisConnection = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null,
});

// Queue configuration with retry and backoff settings
const queueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // Start with 5 seconds, then 25s, then 125s
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 24 * 3600, // Remove after 24 hours
    },
    removeOnFail: {
      count: 500, // Keep last 500 failed jobs for debugging
      age: 7 * 24 * 3600, // Remove after 7 days
    },
  },
};

// Create separate queues for each priority level
export const highPriorityQueue = new Queue<CrawlJobData>(
  'crawl-high',
  queueOptions,
);
export const mediumPriorityQueue = new Queue<CrawlJobData>(
  'crawl-medium',
  queueOptions,
);
export const lowPriorityQueue = new Queue<CrawlJobData>(
  'crawl-low',
  queueOptions,
);

// Map priority to queue
const priorityToQueue = {
  high: highPriorityQueue,
  medium: mediumPriorityQueue,
  low: lowPriorityQueue,
} as const;

/**
 * Enqueue a crawl job with the specified priority
 */
export async function enqueueCrawlJob(
  jobData: CrawlJobData,
  priority: Priority = 'medium',
): Promise<string> {
  const queue = priorityToQueue[priority];

  const job = await queue.add(`${jobData.type}-${jobData.jobId}`, jobData, {
    jobId: jobData.jobId,
  });

  console.log(
    `✓ Enqueued job ${job.id} with ${priority} priority (type: ${jobData.type})`,
  );

  return job.id!;
}

/**
 * Get queue stats for monitoring
 */
export async function getQueueStats() {
  const stats = await Promise.all([
    highPriorityQueue.getJobCounts(),
    mediumPriorityQueue.getJobCounts(),
    lowPriorityQueue.getJobCounts(),
  ]);

  return {
    high: stats[0],
    medium: stats[1],
    low: stats[2],
  };
}

/**
 * Gracefully close all queues and Redis connection
 */
export async function closeQueues() {
  await Promise.all([
    highPriorityQueue.close(),
    mediumPriorityQueue.close(),
    lowPriorityQueue.close(),
  ]);
  await redisConnection.quit();
  console.log('Queues and Redis connection closed');
}
