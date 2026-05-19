import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  CsaeCrawlRequest,
  MemberLoungeCrawlRequest,
  SitemapCrawlRequest,
  UrlCrawlRequest,
  WebsiteCrawlRequest,
} from '../../types.js';
import {
  csaeCrawlSchema,
  memberLoungeCrawlSchema,
  sitemapCrawlSchema,
  urlCrawlSchema,
  websiteCrawlSchema,
} from './crawl.schema.js';
import {
  enqueueMemberLoungeCrawl,
  enqueueSitemapCrawl,
  enqueueUrlCrawl,
  enqueueWebsiteCrawl,
  getCrawlStatus,
} from './crawl.service.js';
import { testMemberLoungeLogin } from './member-lounge/member-lounge.auth.js';
import { crawlCsae } from './csae/csae.crawler.js';
import { logger } from '../../utils/logger.js';

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
    const response = await enqueueUrlCrawl(body, request.webhookSecret);
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
    const response = await enqueueWebsiteCrawl(body, request.webhookSecret);
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
    const response = await enqueueSitemapCrawl(body, request.webhookSecret);
    reply.code(200).send(response);
  } catch (error) {
    handleValidationError(error, reply);
  }
}

export async function createMemberLoungeCrawl(
  request: FastifyRequest<{ Body: MemberLoungeCrawlRequest }>,
  reply: FastifyReply,
): Promise<void> {
  try {
    const body = memberLoungeCrawlSchema.parse(request.body);

    logger.info(
      `Member lounge crawl requested for ${body.memberLoungeUrl} type=${body.type}`,
    );

    const loginResult = await testMemberLoungeLogin(
      body.memberLoungeUrl,
      body.email,
      body.password,
    );

    logger.info(
      `Member lounge login result for ${body.memberLoungeUrl}: ${loginResult.success ? 'success' : 'failure'}`,
    );

    if (!loginResult.success) {
      reply.code(401).send({
        error: 'Authentication Failed',
        message: loginResult.message,
        loginStatus: 'failed',
      });
      return;
    }

    const enqueueResponse = await enqueueMemberLoungeCrawl(
      body,
      request.webhookSecret,
    );
    reply.code(200).send({
      loginStatus: 'successful',
      loginMessage: loginResult.message,
      jobId: enqueueResponse.jobId,
      type: body.type,
      status: enqueueResponse.status,
      estimatedTime: enqueueResponse.estimatedTime,
    });
  } catch (error) {
    handleValidationError(error, reply);
  }
}

export async function createCsaeCrawl(
  request: FastifyRequest<{ Body: CsaeCrawlRequest }>,
  reply: FastifyReply,
): Promise<void> {
  try {
    const body = csaeCrawlSchema.parse(request.body);
    const csaeUrl = body.csaeUrl;

    if (!csaeUrl) {
      reply.code(400).send({
        error: 'Validation Error',
        details: [
          {
            path: ['memberLoungeUrl'],
            message: 'Required',
          },
        ],
      });
      return;
    }

    logger.info(`CSAE crawl requested for ${csaeUrl} type=${body.type}`);

    const result = await crawlCsae({
      csaeUrl,
      email: body.email,
      password: body.password,
      crawlKind: body.type,
      instructions: body.instructions,
    });

    logger.info(`CSAE crawl completed for ${csaeUrl} type=${body.type}`);

    reply.code(200).send({
      type: body.type,
      status: 'completed',
      result,
    });
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
