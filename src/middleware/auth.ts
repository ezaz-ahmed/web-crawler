import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';

/**
 * Authentication middleware for API key verification
 */
export async function authenticateApiKey(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Missing Authorization header',
    });
  }

  // Expected format: "Bearer <api-key>"
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message:
        'Invalid Authorization header format. Expected: Bearer <api-key>',
    });
  }

  // Check if API key is valid
  if (!config.auth.allowedApiKeys.includes(token)) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
  }

  // API key is valid, continue
}
