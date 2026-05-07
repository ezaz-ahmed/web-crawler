import type {
  CsaeDiscussionResult,
  CsaeEventResult,
  CsaeResourceResult,
  CsaeResult,
} from '../../../types.js';
import { withAuthenticatedCsaeSession } from './csae.auth.js';
import { crawlCsaeDiscussions } from './csae.discussions.js';
import { crawlCsaeEvents } from './csae.events.js';
import { crawlCsaeResources } from './csae.resources.js';
import type { CsaeCrawlInput } from './csae.types.js';

export async function crawlCsae(input: CsaeCrawlInput): Promise<CsaeResult> {
  return withAuthenticatedCsaeSession(
    input.csaeUrl,
    input.email,
    input.password,
    async ({ page, session }) => {
      const warnings: string[] = [];

      if (input.crawlKind === 'event') {
        const events = await crawlCsaeEvents(session.normalizedBaseUrl, page);
        const result: CsaeEventResult = {
          csaeUrl: session.normalizedBaseUrl,
          crawlKind: 'event',
          events,
          warnings,
        };
        return result;
      }

      if (input.crawlKind === 'resource') {
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
