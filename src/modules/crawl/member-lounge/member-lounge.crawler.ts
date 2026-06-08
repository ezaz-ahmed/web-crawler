import type {
  MemberLoungeDiscussionResult,
  MemberLoungeEventResult,
  MemberLoungeResourceResult,
  MemberLoungeResult,
} from '../../../types.js';
import { withAuthenticatedSession } from './member-lounge.auth.js';
import { crawlDiscussions } from './member-lounge.discussions.js';
import { crawlEvents } from './member-lounge.events.js';
import { crawlResources } from './member-lounge.resources.js';
import type { MemberLoungeCrawlInput } from './member-lounge.types.js';

export async function crawlMemberLounge(
  input: MemberLoungeCrawlInput,
): Promise<MemberLoungeResult> {
  return withAuthenticatedSession(
    input.memberLoungeUrl,
    input.email,
    input.password,
    async ({ page, session }) => {
      const warnings: string[] = [];

      if (input.crawlKind === 'event') {
        const events = await crawlEvents(session.normalizedBaseUrl, page);
        const result: MemberLoungeEventResult = {
          memberLoungeUrl: session.normalizedBaseUrl,
          crawlKind: 'event',
          events,
          warnings,
        };

        // if (
        //   session.userRole === 'admin' ||
        //   session.userRole === 'super-admin'
        // ) {
        //   try {
        //     const adminEvents = await crawlAdminEvents(
        //       session.normalizedBaseUrl,
        //       page,
        //     );
        //     result.events = [...result.events, ...adminEvents];
        //   } catch {
        //     warnings.push(
        //       'Admin events page is not accessible for current user',
        //     );
        //   }
        // }

        return result;
      }

      if (input.crawlKind === 'resource') {
        const resources = await crawlResources(
          session.normalizedBaseUrl,
          page,
          input.instructions,
        );
        const result: MemberLoungeResourceResult = {
          memberLoungeUrl: session.normalizedBaseUrl,
          crawlKind: 'resource',
          resources,
          warnings,
        };

        // if (
        //   session.userRole === 'admin' ||
        //   session.userRole === 'super-admin'
        // ) {
        //   try {
        //     const adminResources = await crawlAdminResources(
        //       session.normalizedBaseUrl,
        //       page,
        //       input.instructions,
        //     );
        //     result.resources = [...result.resources, ...adminResources];
        //   } catch {
        //     warnings.push(
        //       'Admin resources page is not accessible for current user',
        //     );
        //   }
        // }

        return result;
      }

      const discussions = await crawlDiscussions(
        session.normalizedBaseUrl,
        page,
      );
      const discussionResult: MemberLoungeDiscussionResult = {
        memberLoungeUrl: session.normalizedBaseUrl,
        crawlKind: 'discussion',
        discussions,
        warnings,
      };

      return discussionResult;
    },
  );
}
