import type { CsaeCrawlKind } from '../../../types.js';

export interface CsaeLoginResult {
  success: boolean;
  message: string;
}

export interface CsaeCrawlInput {
  csaeUrl: string;
  email: string;
  password: string;
  crawlKind: CsaeCrawlKind;
  instructions?: string;
}

export interface AuthenticatedCsaeSession {
  normalizedBaseUrl: string;
}
