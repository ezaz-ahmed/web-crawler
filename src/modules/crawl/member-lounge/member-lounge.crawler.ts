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
import { redisConnection } from '../../../plugins/redis.js';

function mlAuthKey(memberLoungeUrl: string): string {
  const parsed = new URL(memberLoungeUrl);
  return `ml:auth:${parsed.protocol}//${parsed.host}`;
}

export async function crawlMemberLounge(
  input: MemberLoungeCrawlInput,
): Promise<MemberLoungeResult> {
  if (input.crawlKind === 'resource') {
    const baseUrl = new URL(input.memberLoungeUrl).origin;
    const authToken = await redisConnection.get(mlAuthKey(input.memberLoungeUrl));

    if (!authToken) {
      throw new Error(`Auth token not found in Redis for ${baseUrl}`);
    }

    const resources = await crawlResources(baseUrl, authToken, input.instructions);

    return {
      memberLoungeUrl: baseUrl,
      crawlKind: 'resource',
      resources,
      warnings: [],
    } satisfies MemberLoungeResourceResult;
  }

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
