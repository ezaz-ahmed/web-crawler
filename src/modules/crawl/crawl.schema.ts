import { z } from 'zod';
import { config } from '../../config.js';

function isBlockedIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);

  if (octets.length !== 4 || octets.some((value) => Number.isNaN(value))) {
    return false;
  }

  const [a, b] = octets;

  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isBlockedIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fe90:') ||
    normalized.startsWith('fea0:') ||
    normalized.startsWith('feb0:')
  );
}

function isSafePublicHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  if (normalized === 'localhost') {
    return false;
  }

  if (isBlockedIpv4(normalized) || isBlockedIpv6(normalized)) {
    return false;
  }

  return true;
}

function isAllowedCrawlUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== 'http:' && protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    if (!isSafePublicHostname(hostname)) {
      return false;
    }

    const allowedDomains = config.crawler.allowedDomains;

    if (allowedDomains.length === 0) {
      return false;
    }

    return allowedDomains.includes(hostname);
  } catch {
    return false;
  }
}

const allowedCrawlUrl = z.string().url().refine(isAllowedCrawlUrl, {
  message:
    'URL must use http(s), target a public hostname, and match ALLOWED_CRAWL_DOMAINS exactly',
});

export const urlCrawlSchema = z.object({
  url: allowedCrawlUrl,
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
  sitemapUrl: allowedCrawlUrl,
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  instructions: z.string().optional(),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  callbackUrl: z.string().url().optional(),
});

export const memberLoungeCrawlSchema = z.object({
  memberLoungeUrl: allowedCrawlUrl,
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
    csaeUrl: allowedCrawlUrl.optional(),
    memberLoungeUrl: allowedCrawlUrl.optional(),
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
