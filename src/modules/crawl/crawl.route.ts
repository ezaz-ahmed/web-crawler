import type { FastifyInstance } from 'fastify';
import { authenticateApiKey } from '../../middleware/auth.js';
import type {
  SitemapCrawlRequest,
  UrlCrawlRequest,
  WebsiteCrawlRequest,
} from '../../types.js';
import {
  createSitemapCrawl,
  createUrlCrawl,
  createWebsiteCrawl,
  getCrawlStatusById,
} from './crawl.controller.js';

export async function registerCrawlRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: UrlCrawlRequest }>(
    '/crawl/url',
    { preHandler: authenticateApiKey },
    createUrlCrawl,
  );

  app.post<{ Body: WebsiteCrawlRequest }>(
    '/crawl/website',
    { preHandler: authenticateApiKey },
    createWebsiteCrawl,
  );

  app.post<{ Body: SitemapCrawlRequest }>(
    '/crawl/sitemap',
    { preHandler: authenticateApiKey },
    createSitemapCrawl,
  );

  app.get('/crawl/status/:jobId', getCrawlStatusById);
}
