import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import type { AppConfig } from './types.js';

// Load environment variables from .env file
loadEnv();

// Define Zod schema for environment variables
const envSchema = z.object({
  // Server
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // Redis
  REDIS_URL: z.string().url(),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_ENDPOINT: z.string().url(),

  // Authentication
  ALLOWED_API_KEYS: z
    .string()
    .min(1)
    .transform((keys) => keys.split(',')),

  // Crawler settings
  USER_AGENT: z.string().default('WebCrawlerBot/1.0'),
  MAX_CONCURRENT_REQUESTS: z.string().default('5').transform(Number),
  REQUEST_TIMEOUT: z.string().default('30000').transform(Number),
  RATE_LIMIT_PER_DOMAIN: z.string().default('1000').transform(Number),
});

// Validate environment variables
function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('\n');
      throw new Error(`Invalid environment configuration:\n${missing}`);
    }
    throw error;
  }
}

// Parse and validate environment variables
const env = validateEnv();

// Export typed configuration
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
  r2: {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_BUCKET_NAME,
    endpoint: env.R2_ENDPOINT,
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

// Log configuration (without sensitive values)
export function logConfig() {
  console.log('Configuration loaded:');
  console.log(`- Environment: ${config.nodeEnv}`);
  console.log(`- Port: ${config.port}`);
  console.log(`- Redis URL: ${config.redis.url}`);
  console.log(`- OpenAI Model: ${config.openai.model}`);
  console.log(`- R2 Bucket: ${config.r2.bucketName}`);
  console.log(`- API Keys configured: ${config.auth.allowedApiKeys.length}`);
  console.log(`- User Agent: ${config.crawler.userAgent}`);
}
