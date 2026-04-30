# Web Crawler API Documentation

## Base URL

```
http://localhost:3000
```

## Authentication

All `/crawl/*` endpoints (except `/crawl/status/:jobId`) require a Bearer token in the `Authorization` header.

```
Authorization: Bearer <your-api-key>
```

API keys are configured via the `ALLOWED_API_KEYS` environment variable (comma-separated).

### Authentication Errors

| Status | Response                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| `401`  | `{ "error": "Unauthorized", "message": "Missing Authorization header" }`                                    |
| `401`  | `{ "error": "Unauthorized", "message": "Invalid Authorization header format. Expected: Bearer <api-key>" }` |
| `401`  | `{ "error": "Unauthorized", "message": "Invalid API key" }`                                                 |

---

## Endpoints

### `GET /health`

Health check endpoint. Returns service status, Redis connectivity, and queue statistics.

**Authentication:** None

#### Response `200 OK`

```json
{
  "status": "healthy",
  "timestamp": "2026-03-31T10:00:00.000Z",
  "services": {
    "redis": "connected"
  },
  "queues": { ... },
  "jobs": { ... }
}
```

#### Response `503 Service Unavailable`

```json
{
  "status": "unhealthy",
  "error": "Connection refused"
}
```

---

### `POST /crawl/url`

Crawl a single URL and convert its content to AI-processed markdown.

**Authentication:** Required

#### Request Body

| Field             | Type                              | Required | Default    | Description                                              |
| ----------------- | --------------------------------- | -------- | ---------- | -------------------------------------------------------- |
| `url`             | `string` (valid URL)              | **Yes**  | —          | The URL to crawl                                         |
| `priority`        | `"low"` \| `"medium"` \| `"high"` | No       | `"medium"` | Job queue priority                                       |
| `instructions`    | `string`                          | No       | —          | Custom instructions for AI markdown conversion           |
| `includePatterns` | `string[]`                        | No       | —          | URL patterns to include                                  |
| `excludePatterns` | `string[]`                        | No       | —          | URL patterns to exclude                                  |
| `callbackUrl`     | `string` (valid URL)              | No       | —          | URL to receive a webhook when the job completes or fails |

#### Example Request

```bash
curl -X POST http://localhost:3000/crawl/url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "url": "https://example.com/page",
    "priority": "high",
    "instructions": "Focus on the main article content",
    "callbackUrl": "https://melopro.memberlounge.app/webhook/crawl"
  }'
```

#### Response `200 OK`

```json
{
  "jobId": "abc123",
  "status": "queued",
  "estimatedTime": "1-2 minutes"
}
```

#### Response `400 Bad Request`

```json
{
  "error": "Validation Error",
  "details": [
    {
      "code": "invalid_string",
      "message": "Invalid url",
      "path": ["url"]
    }
  ]
}
```

---

### `POST /crawl/website`

Recursively crawl a website up to a specified depth and page limit.

**Authentication:** Required

#### Request Body

| Field             | Type                              | Required | Default    | Description                                              |
| ----------------- | --------------------------------- | -------- | ---------- | -------------------------------------------------------- |
| `url`             | `string` (valid URL)              | **Yes**  | —          | Root URL to start crawling from                          |
| `crawlDepth`      | `integer` (1–5)                   | **Yes**  | —          | How many link levels deep to crawl                       |
| `maxPages`        | `integer` (1–1000)                | **Yes**  | —          | Maximum number of pages to crawl                         |
| `priority`        | `"low"` \| `"medium"` \| `"high"` | No       | `"medium"` | Job queue priority                                       |
| `instructions`    | `string`                          | No       | —          | Custom instructions for AI markdown conversion           |
| `includePatterns` | `string[]`                        | No       | —          | URL patterns to include                                  |
| `excludePatterns` | `string[]`                        | No       | —          | URL patterns to exclude                                  |
| `callbackUrl`     | `string` (valid URL)              | No       | —          | URL to receive a webhook when the job completes or fails |

#### Example Request

```bash
curl -X POST http://localhost:3000/crawl/website \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "url": "https://example.com",
    "crawlDepth": 3,
    "maxPages": 50,
    "priority": "medium",
    "excludePatterns": ["/blog/*", "/archive/*"],
    "callbackUrl": "https://melopro.memberlounge.app/webhook/crawl"
  }'
```

#### Response `200 OK`

```json
{
  "jobId": "xyz789",
  "status": "queued",
  "estimatedTime": "25-50 minutes"
}
```

Estimated time is calculated based on `maxPages` (≈ `ceil(maxPages / 2)` to `ceil(maxPages / 2) * 2` minutes).

#### Response `400 Bad Request`

```json
{
  "error": "Validation Error",
  "details": [
    {
      "code": "too_small",
      "minimum": 1,
      "message": "Number must be greater than or equal to 1",
      "path": ["crawlDepth"]
    }
  ]
}
```

---

### `POST /crawl/sitemap`

Crawl all URLs found in a sitemap XML file.

**Authentication:** Required

#### Request Body

| Field             | Type                              | Required | Default    | Description                                              |
| ----------------- | --------------------------------- | -------- | ---------- | -------------------------------------------------------- |
| `sitemapUrl`      | `string` (valid URL)              | **Yes**  | —          | URL of the sitemap XML file                              |
| `priority`        | `"low"` \| `"medium"` \| `"high"` | No       | `"medium"` | Job queue priority                                       |
| `instructions`    | `string`                          | No       | —          | Custom instructions for AI markdown conversion           |
| `includePatterns` | `string[]`                        | No       | —          | URL patterns to include                                  |
| `excludePatterns` | `string[]`                        | No       | —          | URL patterns to exclude                                  |
| `callbackUrl`     | `string` (valid URL)              | No       | —          | URL to receive a webhook when the job completes or fails |

#### Example Request

```bash
curl -X POST http://localhost:3000/crawl/sitemap \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "sitemapUrl": "https://example.com/sitemap.xml",
    "includePatterns": ["/docs/*"],
    "callbackUrl": "https://melopro.memberlounge.app/webhook/crawl"
  }'
```

#### Response `200 OK`

```json
{
  "jobId": "def456",
  "status": "queued",
  "estimatedTime": "5-10 minutes"
}
```

#### Response `400 Bad Request`

```json
{
  "error": "Validation Error",
  "details": [
    {
      "code": "invalid_string",
      "message": "Invalid url",
      "path": ["sitemapUrl"]
    }
  ]
}
```

---

### `GET /crawl/status/:jobId`

Check the status and retrieve results of a crawl job.

**Authentication:** None

#### Path Parameters

| Parameter | Type     | Description                               |
| --------- | -------- | ----------------------------------------- |
| `jobId`   | `string` | The job ID returned from a crawl endpoint |

#### Example Request

```bash
curl http://localhost:3000/crawl/status/abc123
```

#### Response — Queued

```json
{
  "jobId": "abc123",
  "status": "queued",
  "createdAt": "2026-03-31T10:28:00.000Z"
}
```

#### Response — Processing (multi-page)

```json
{
  "jobId": "xyz789",
  "status": "processing",
  "progress": 42,
  "createdAt": "2026-03-31T10:28:00.000Z"
}
```

#### Response — Completed (single URL)

```json
{
  "jobId": "abc123",
  "status": "completed",
  "result": {
    "url": "https://example.com/page",
    "title": "Page Title",
    "markdown": "# Page Title\n\nContent here...",
    "wordCount": 500,
    "fetchedAt": "2026-03-31T10:30:00.000Z"
  },
  "createdAt": "2026-03-31T10:28:00.000Z",
  "completedAt": "2026-03-31T10:30:00.000Z"
}
```

#### Response — Completed (website / sitemap)

```json
{
  "jobId": "xyz789",
  "status": "completed",
  "progress": 100,
  "result": {
    "rootUrl": "https://example.com",
    "totalPages": 47,
    "pages": [
      {
        "url": "https://example.com/page-1",
        "title": "Page 1",
        "markdown": "# Page 1\\n\\nContent here..."
      }
    ]
  },
  "createdAt": "2026-03-31T10:28:00.000Z",
  "completedAt": "2026-03-31T11:15:00.000Z"
}
```

#### Response — Failed

```json
{
  "jobId": "abc123",
  "status": "failed",
  "error": "Request timed out after 30000ms",
  "createdAt": "2026-03-31T10:28:00.000Z"
}
```

#### Response `404 Not Found`

```json
{
  "error": "Not Found",
  "message": "Job abc123 not found"
}
```

---

## Common Error Responses

| Status Code | Body                                                     | Description                            |
| ----------- | -------------------------------------------------------- | -------------------------------------- |
| `400`       | `{ "error": "Validation Error", "details": [...] }`      | Invalid or missing request body fields |
| `401`       | `{ "error": "Unauthorized", "message": "..." }`          | Missing or invalid API key             |
| `404`       | `{ "error": "Not Found", "message": "..." }`             | Job ID does not exist                  |
| `500`       | `{ "error": "Internal Server Error", "message": "..." }` | Unexpected server error                |
| `503`       | `{ "status": "unhealthy", "error": "..." }`              | Service unavailable (health check)     |

> **Note:** In development mode (`NODE_ENV=development`), the `500` error response includes the actual error message. In production, a generic message is returned.

---

## Job Lifecycle

```
queued → processing → completed
                    → failed
```

| Status       | Description                                       |
| ------------ | ------------------------------------------------- |
| `queued`     | Job has been accepted and is waiting in the queue |
| `processing` | Job is currently being executed                   |
| `completed`  | Job finished successfully; results are available  |
| `failed`     | Job encountered an error                          |

The `progress` field (0–100) is populated for multi-page crawls (website and sitemap jobs).

---

## Supported Content Types

The crawler automatically detects and processes the following content types:

| Type | Description              |
| ---- | ------------------------ |
| HTML | Standard web pages       |
| PDF  | PDF documents            |
| DOCX | Microsoft Word documents |

All content is converted to AI-processed markdown using OpenAI.

---

## Environment Variables

| Variable                  | Required | Default             | Description                             |
| ------------------------- | -------- | ------------------- | --------------------------------------- |
| `PORT`                    | No       | `3000`              | Server port                             |
| `NODE_ENV`                | No       | `development`       | `development` \| `production` \| `test` |
| `REDIS_URL`               | **Yes**  | —                   | Redis connection URL                    |
| `OPENAI_API_KEY`          | **Yes**  | —                   | OpenAI API key                          |
| `OPENAI_MODEL`            | No       | `gpt-4o-mini`       | OpenAI model to use                     |
| `ALLOWED_API_KEYS`        | **Yes**  | —                   | Comma-separated list of valid API keys  |
| `USER_AGENT`              | No       | `WebCrawlerBot/1.0` | Crawler user agent string               |
| `MAX_CONCURRENT_REQUESTS` | No       | `5`                 | Max concurrent fetch requests           |
| `REQUEST_TIMEOUT`         | No       | `30000`             | Request timeout in milliseconds         |
| `RATE_LIMIT_PER_DOMAIN`   | No       | `1000`              | Rate limit delay per domain in ms       |
