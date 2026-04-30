import type { FastifyInstance } from 'fastify';
import { config } from '../config/env.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);

    return reply.code(500).send({
      error: 'Internal Server Error',
      message:
        config.nodeEnv === 'development'
          ? error.message
          : 'An unexpected error occurred',
    });
  });
}
