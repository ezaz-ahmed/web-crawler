import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { config } from './config.js';
import { authenticateApiKey } from './middleware/auth.js';
import { enqueueCrawlJob, getQueueStats, redisConnection } from './queue.js';
import { jobStateManager } from './jobState.js';
import type {
  UrlCrawlRequest,
  WebsiteCrawlRequest,
  SitemapCrawlRequest,
  EnqueueResponse,
  StatusResponse,
  Priority,
} from './types.js';

// Create Fastify instance
export const app = Fastify({
  logger:
    config.nodeEnv === 'development'
      ? {
          level: 'info',
        }
      : false,
});

// Register CORS
await app.register(cors, {
  origin: true, // Allow all origins for now
});

// ============================================================================
// Request Schemas
// ============================================================================

const urlCrawlSchema = z.object({
  url: z.string().url(),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  instructions: z.string().optional(),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  callbackUrl: z.string().url().optional(),
});

const websiteCrawlSchema = urlCrawlSchema.extend({
  crawlDepth: z.number().int().min(1).max(5),
  maxPages: z.number().int().min(1).max(1000),
});

const sitemapCrawlSchema = z.object({
  sitemapUrl: z.string().url(),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  instructions: z.string().optional(),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  callbackUrl: z.string().url().optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

function estimateTime(type: string, params: any): string {
  if (type === 'url') {
    return '1-2 minutes';
  } else if (type === 'website') {
    const pages = params.maxPages || 10;
    const minutes = Math.ceil(pages / 2);
    return `${minutes}-${minutes * 2} minutes`;
  } else if (type === 'sitemap') {
    return '5-10 minutes';
  }
  return 'Unknown';
}

// ============================================================================
// Routes
// ============================================================================

// Health check endpoint
app.get('/health', async (request, reply) => {
  try {
    // Check Redis connection
    await redisConnection.ping();

    // Get queue stats
    const stats = await getQueueStats();
    const jobStats = jobStateManager.getStats();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        redis: 'connected',
      },
      queues: stats,
      jobs: jobStats,
    };
  } catch (error) {
    return reply.code(503).send({
      status: 'unhealthy',
      error: (error as Error).message,
    });
  }
});

// POST /crawl/url - Single URL crawl
app.post<{ Body: UrlCrawlRequest }>(
  '/crawl/url',
  {
    preHandler: authenticateApiKey,
  },
  async (request, reply) => {
    try {
      const body = urlCrawlSchema.parse(request.body);
      const jobId = nanoid();

      // Create job state
      jobStateManager.createJob(jobId, 'url');

      // Enqueue job
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

      const response: EnqueueResponse = {
        jobId,
        status: 'queued',
        estimatedTime: estimateTime('url', body),
      };

      return reply.code(200).send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation Error',
          details: error.errors,
        });
      }
      throw error;
    }
  },
);

// POST /crawl/website - Recursive website crawl
app.post<{ Body: WebsiteCrawlRequest }>(
  '/crawl/website',
  {
    preHandler: authenticateApiKey,
  },
  async (request, reply) => {
    try {
      const body = websiteCrawlSchema.parse(request.body);
      const jobId = nanoid();

      // Create job state
      jobStateManager.createJob(jobId, 'website');

      // Enqueue job
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

      const response: EnqueueResponse = {
        jobId,
        status: 'queued',
        estimatedTime: estimateTime('website', body),
      };

      return reply.code(200).send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation Error',
          details: error.errors,
        });
      }
      throw error;
    }
  },
);

// POST /crawl/sitemap - Sitemap crawl
app.post<{ Body: SitemapCrawlRequest }>(
  '/crawl/sitemap',
  {
    preHandler: authenticateApiKey,
  },
  async (request, reply) => {
    try {
      const body = sitemapCrawlSchema.parse(request.body);
      const jobId = nanoid();

      // Create job state
      jobStateManager.createJob(jobId, 'sitemap');

      // Enqueue job
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

      const response: EnqueueResponse = {
        jobId,
        status: 'queued',
        estimatedTime: estimateTime('sitemap', body),
      };

      return reply.code(200).send(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation Error',
          details: error.errors,
        });
      }
      throw error;
    }
  },
);

// GET /crawl/status/:jobId - Get job status
app.get<{ Params: { jobId: string } }>(
  '/crawl/status/:jobId',
  async (request, reply) => {
    const { jobId } = request.params;

    const jobState = jobStateManager.getJobStatus(jobId);

    if (!jobState) {
      return reply.code(404).send({
        error: 'Not Found',
        message: `Job ${jobId} not found`,
      });
    }

    const response: StatusResponse = {
      jobId: jobState.jobId,
      status: jobState.status,
      progress: jobState.progress,
      result: jobState.result,
      error: jobState.error,
      createdAt: jobState.createdAt,
      completedAt: jobState.completedAt,
    };

    return reply.code(200).send(response);
  },
);

// Global error handler
app.setErrorHandler((error, request, reply) => {
  app.log.error(error);

  return reply.code(500).send({
    error: 'Internal Server Error',
    message:
      config.nodeEnv === 'development'
        ? error.message
        : 'An unexpected error occurred',
  });
});

/**
 * Start the Fastify server
 */
export async function startServer(): Promise<void> {
  try {
    await app.listen({
      port: config.port,
      host: '0.0.0.0',
    });
    console.log(`✓ Server listening on port ${config.port}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Stop the Fastify server
 */
export async function stopServer(): Promise<void> {
  await app.close();
  console.log('Server stopped');
}
