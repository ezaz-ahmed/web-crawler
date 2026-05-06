import type {
  MemberLoungeCrawlKind,
  MemberLoungeDiscussion,
  MemberLoungeEvent,
  MemberLoungeResource,
} from '../../../types.js';

export interface MemberLoungeLoginResult {
  success: boolean;
  message: string;
}

export interface MemberLoungeCrawlInput {
  memberLoungeUrl: string;
  email: string;
  password: string;
  crawlKind: MemberLoungeCrawlKind;
  instructions?: string;
}

export interface AuthenticatedSession {
  normalizedBaseUrl: string;
  userRole: 'unknown' | 'member' | 'admin' | 'super-admin';
}

export interface ExtractedEventPage {
  events: MemberLoungeEvent[];
}

export interface ExtractedResourcePage {
  resources: MemberLoungeResource[];
}

export interface ExtractedDiscussionPage {
  discussions: MemberLoungeDiscussion[];
}
