import { z } from 'zod';

export const urlCrawlSchema = z.object({
  url: z.string().url(),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  instructions: z.string().optional(),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  callbackUrl: z.string().url().optional(),
});

export const websiteCrawlSchema = urlCrawlSchema.extend({
  crawlDepth: z.number().int().min(1).max(5),
  maxPages: z.number().int().min(1).max(1000),
});

export const sitemapCrawlSchema = z.object({
  sitemapUrl: z.string().url(),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  instructions: z.string().optional(),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  callbackUrl: z.string().url().optional(),
});
