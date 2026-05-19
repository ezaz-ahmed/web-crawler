import type {
  CsaeDiscussionResult,
  CsaeEventResult,
  CsaeResourceResult,
  CsaeResult,
} from '../../../types.js';
import { logger } from '../../../utils/logger.js';
import {
  withAuthenticatedCsaeSession,
  withCsaeEventSession,
} from './csae.auth.js';
import { crawlCsaeDiscussions } from './csae.discussions.js';
import { crawlCsaeEvents } from './csae.events.js';
import { crawlCsaeResources } from './csae.resources.js';
import type { CsaeCrawlInput } from './csae.types.js';

export async function crawlCsae(input: CsaeCrawlInput): Promise<CsaeResult> {
  logger.info(`CSAE step: starting crawl type=${input.crawlKind}`);

  if (input.crawlKind === 'event') {
    logger.info(
      'CSAE step: crawl kind is event — navigating to calendar first, auth check on arrival',
    );
    return withCsaeEventSession(
      input.csaeUrl,
      input.email,
      input.password,
      async ({ page, session }) => {
        const events = await crawlCsaeEvents(session.normalizedBaseUrl, page);
        logger.info(
          `CSAE step: calendar crawl complete, found ${events.length} events`,
        );
        const result: CsaeEventResult = {
          csaeUrl: session.normalizedBaseUrl,
          crawlKind: 'event',
          events,
          warnings: [],
        };
        return result;
      },
    );
  }

  return withAuthenticatedCsaeSession(
    input.csaeUrl,
    input.email,
    input.password,
    async ({ page, session }) => {
      const warnings: string[] = [];

      if (input.crawlKind === 'resource') {
        logger.info('CSAE step: crawl kind is resource');
        const resources = await crawlCsaeResources(
          session.normalizedBaseUrl,
          page,
        );
        const result: CsaeResourceResult = {
          csaeUrl: session.normalizedBaseUrl,
          crawlKind: 'resource',
          resources,
          warnings,
        };
        return result;
      }

      logger.info('CSAE step: crawl kind is discussion');
      const discussions = await crawlCsaeDiscussions(
        session.normalizedBaseUrl,
        page,
      );
      const result: CsaeDiscussionResult = {
        csaeUrl: session.normalizedBaseUrl,
        crawlKind: 'discussion',
        discussions,
        warnings,
      };
      return result;
    },
  );
}
