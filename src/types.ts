// ============================================================================
// Priority and Status Types
// ============================================================================

export type Priority = 'low' | 'medium' | 'high';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type ContentType = 'html' | 'pdf' | 'docx' | 'unsupported';
export type CrawlType = 'url' | 'website' | 'sitemap';

// ============================================================================
// Request Types
// ============================================================================

export interface BaseRequestParams {
  priority?: Priority;
  instructions?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  callbackUrl?: string;
}

export interface UrlCrawlRequest extends BaseRequestParams {
  url: string;
}

export interface WebsiteCrawlRequest extends BaseRequestParams {
  url: string;
  crawlDepth: number; // 1-5
  maxPages: number; // 1-1000
}

export interface SitemapCrawlRequest extends BaseRequestParams {
  sitemapUrl: string;
}

// ============================================================================
// Job Types
// ============================================================================

export interface BaseJobData extends BaseRequestParams {
  type: CrawlType;
  jobId: string;
  createdAt: Date;
}

export interface UrlJobData extends BaseJobData {
  type: 'url';
  url: string;
}

export interface WebsiteJobData extends BaseJobData {
  type: 'website';
  url: string;
  crawlDepth: number;
  maxPages: number;
}

export interface SitemapJobData extends BaseJobData {
  type: 'sitemap';
  sitemapUrl: string;
}

export type CrawlJobData = UrlJobData | WebsiteJobData | SitemapJobData;

// ============================================================================
// Job State Types
// ============================================================================

export interface JobState {
  jobId: string;
  status: JobStatus;
  type: CrawlType;
  progress?: number; // 0-100 for multi-page crawls
  result?: CrawlResult;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

// ============================================================================
// Result Types
// ============================================================================

export interface PageResult {
  url: string;
  title: string;
  content: string; // Raw text content
  markdown?: string; // AI-processed markdown
  links: string[];
  wordCount?: number;
  fetchedAt: Date;
}

export interface SingleUrlResult {
  url: string;
  title: string;
  markdown: string;
  wordCount: number;
  fetchedAt: Date;
}

export interface MultiPageResult {
  rootUrl: string;
  totalPages: number;
  pages: Array<{
    url: string;
    title: string;
    markdown: string;
  }>;
}

export type CrawlResult = SingleUrlResult | MultiPageResult;

// ============================================================================
// Webhook Types
// ============================================================================

export type WebhookEvent =
  | 'job.queued'
  | 'job.processing'
  | 'job.progress'
  | 'job.completed'
  | 'job.failed';

export interface WebhookPayload {
  event: WebhookEvent;
  jobId: string;
  type: CrawlType;
  status: JobStatus;
  /** 0-100, present for job.progress events */
  progress?: number;
  /** Present for job.completed */
  result?: CrawlResult;
  /** Present for job.failed */
  error?: string;
  timestamp: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface EnqueueResponse {
  jobId: string;
  status: 'queued';
  estimatedTime?: string;
}

export interface StatusResponse {
  jobId: string;
  status: JobStatus;
  progress?: number;
  result?: CrawlResult;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

// ============================================================================
// Fetcher Types
// ============================================================================

export interface FetchResult {
  content: string;
  links: string[];
  title: string;
  contentType: ContentType;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface AppConfig {
  port: number;
  nodeEnv: string;
  redis: {
    url: string;
  };
  openai: {
    apiKey: string;
    model: string;
  };
  auth: {
    allowedApiKeys: string[];
  };
  crawler: {
    userAgent: string;
    maxConcurrentRequests: number;
    requestTimeout: number;
    rateLimitPerDomain: number; // milliseconds between requests
  };
}
