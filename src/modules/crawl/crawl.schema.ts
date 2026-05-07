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

export const memberLoungeCrawlSchema = z.object({
  memberLoungeUrl: z
    .string()
    .url()
    .refine((value) => {
      try {
        const parsed = new URL(value);
        return parsed.hostname.endsWith('.memberlounge.app');
      } catch {
        return false;
      }
    }, 'memberLoungeUrl must be a valid memberlounge.app domain'),
  type: z.preprocess(
    (value) => (typeof value === 'string' ? value.toLowerCase() : value),
    z.enum(['event', 'resource', 'discussion']),
  ),
  email: z.string().email(),
  password: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  instructions: z.string().optional(),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  callbackUrl: z.string().url().optional(),
});

export const csaeCrawlSchema = z
  .object({
    csaeUrl: z.string().url().optional(),
    memberLoungeUrl: z.string().url().optional(),
    type: z.preprocess(
      (value) => (typeof value === 'string' ? value.toLowerCase() : value),
      z.enum(['event', 'resource', 'discussion']),
    ),
    email: z.string().email(),
    password: z.string().min(1),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
    instructions: z.string().optional(),
    includePatterns: z.array(z.string()).optional(),
    excludePatterns: z.array(z.string()).optional(),
    callbackUrl: z.string().url().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.csaeUrl && !value.memberLoungeUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['memberLoungeUrl'],
        message: 'Required',
      });
    }
  })
  .transform((value) => ({
    ...value,
    csaeUrl: value.csaeUrl ?? value.memberLoungeUrl,
  }));
