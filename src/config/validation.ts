import { z } from 'zod';

export const envSchema = z.object({
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

export type Env = z.infer<typeof envSchema>;

export function validateEnv(input: NodeJS.ProcessEnv): Env {
  try {
    return envSchema.parse(input);
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
