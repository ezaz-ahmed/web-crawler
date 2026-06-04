import { config as loadEnv } from 'dotenv';
import type { AppConfig } from '../types.js';
import { validateEnv } from './validation.js';

loadEnv();

const env = validateEnv(process.env);

function parseApiKeySecretMappings(raw: string): Array<{
  apiKey: string;
  webhookSecret: string;
}> {
  const mappings = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf(':');

      if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
        throw new Error(
          `Invalid ALLOWED_API_KEYS entry "${entry}". Expected format: api_key:webhook_secret`,
        );
      }

      const apiKey = entry.slice(0, separatorIndex).trim();
      const webhookSecret = entry.slice(separatorIndex + 1).trim();

      if (!apiKey || !webhookSecret) {
        throw new Error(
          `Invalid ALLOWED_API_KEYS entry "${entry}". API key and webhook secret are required.`,
        );
      }

      return { apiKey, webhookSecret };
    });

  if (mappings.length === 0) {
    throw new Error(
      'ALLOWED_API_KEYS must contain at least one api_key:webhook_secret pair.',
    );
  }

  return mappings;
}


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
    apiKeys: parseApiKeySecretMappings(env.ALLOWED_API_KEYS),
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
