import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';

declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: string;
    webhookSecret?: string;
  }
}

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

  const apiKeyConfig = config.auth.apiKeys.find(
    (entry) => entry.apiKey === token,
  );

  // Check if API key is valid
  if (!apiKeyConfig) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
  }

  // API key is valid, continue
  request.apiKey = apiKeyConfig.apiKey;
  request.webhookSecret = apiKeyConfig.webhookSecret;
}
