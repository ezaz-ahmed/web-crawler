import type { FastifyInstance } from 'fastify';
import { logger } from '../utils/logger.js';

export function registerRequestLogger(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    logger.info(`${request.method} ${request.url}`);
  });
}
