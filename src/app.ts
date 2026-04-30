import cors from '@fastify/cors';
import Fastify from 'fastify';
import { config } from './config/env.js';
import { registerErrorHandler } from './middleware/error-handler.js';
import { registerRequestLogger } from './middleware/request-logger.js';
import { registerCrawlRoutes } from './modules/crawl/crawl.route.js';
import { getJobStats } from './modules/crawl/job.js';
import { redisConnection } from './plugins/redis.js';
import { getQueueStats } from './queue.js';

export const app = Fastify({
  logger:
    config.nodeEnv === 'development'
      ? {
          level: 'info',
        }
      : false,
});

registerRequestLogger(app);

await app.register(cors, {
  origin: true,
});

await registerCrawlRoutes(app);

app.get('/health', async (_request, reply) => {
  try {
    await redisConnection.ping();

    const stats = await getQueueStats();
    const jobStats = getJobStats();

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

registerErrorHandler(app);
