import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  SitemapCrawlRequest,
  UrlCrawlRequest,
  WebsiteCrawlRequest,
} from '../../types.js';
import {
  sitemapCrawlSchema,
  urlCrawlSchema,
  websiteCrawlSchema,
} from './crawl.schema.js';
import {
  enqueueSitemapCrawl,
  enqueueUrlCrawl,
  enqueueWebsiteCrawl,
  getCrawlStatus,
} from './crawl.service.js';

function handleValidationError(error: unknown, reply: FastifyReply): void {
  if (error instanceof z.ZodError) {
    reply.code(400).send({
      error: 'Validation Error',
      details: error.errors,
    });
    return;
  }

  throw error;
}

export async function createUrlCrawl(
  request: FastifyRequest<{ Body: UrlCrawlRequest }>,
  reply: FastifyReply,
): Promise<void> {
  try {
    const body = urlCrawlSchema.parse(request.body);
    const response = await enqueueUrlCrawl(body);
    reply.code(200).send(response);
  } catch (error) {
    handleValidationError(error, reply);
  }
}

export async function createWebsiteCrawl(
  request: FastifyRequest<{ Body: WebsiteCrawlRequest }>,
  reply: FastifyReply,
): Promise<void> {
  try {
    const body = websiteCrawlSchema.parse(request.body);
    const response = await enqueueWebsiteCrawl(body);
    reply.code(200).send(response);
  } catch (error) {
    handleValidationError(error, reply);
  }
}

export async function createSitemapCrawl(
  request: FastifyRequest<{ Body: SitemapCrawlRequest }>,
  reply: FastifyReply,
): Promise<void> {
  try {
    const body = sitemapCrawlSchema.parse(request.body);
    const response = await enqueueSitemapCrawl(body);
    reply.code(200).send(response);
  } catch (error) {
    handleValidationError(error, reply);
  }
}

export async function getCrawlStatusById(
  request: FastifyRequest<{ Params: { jobId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { jobId } = request.params;
  const response = getCrawlStatus(jobId);

  if (!response) {
    reply.code(404).send({
      error: 'Not Found',
      message: `Job ${jobId} not found`,
    });
    return;
  }

  reply.code(200).send(response);
}
