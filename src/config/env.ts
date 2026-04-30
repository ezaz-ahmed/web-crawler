import { config as loadEnv } from 'dotenv';
import type { AppConfig } from '../types.js';
import { validateEnv } from './validation.js';

loadEnv();

const env = validateEnv(process.env);

export const config: AppConfig = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  redis: {
    url: env.REDIS_URL,
  },
  openai: {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
  },
  auth: {
    allowedApiKeys: env.ALLOWED_API_KEYS,
  },
  crawler: {
    userAgent: env.USER_AGENT,
    maxConcurrentRequests: env.MAX_CONCURRENT_REQUESTS,
    requestTimeout: env.REQUEST_TIMEOUT,
    rateLimitPerDomain: env.RATE_LIMIT_PER_DOMAIN,
  },
};

export function logConfig() {
  console.log('✔️ Configuration loaded:');
}
