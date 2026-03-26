# Web Crawler API

An async web crawler API with AI-powered markdown conversion using OpenAI. Built with Fastify, BullMQ, and TypeScript.

## Features

- **Three crawl modes:**
  - Single URL crawl
  - Recursive website crawl with depth control
  - Sitemap-based crawl
- **Priority queue system** (high/medium/low)
- **Multi-format support:** HTML, PDF, DOCX
- **AI-powered markdown conversion** using OpenAI
- **Pattern-based URL filtering** (include/exclude)
- **Robots.txt compliance**
- **Rate limiting** per domain
- **Cloudflare R2 storage** for multi-page results

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for Redis)
- OpenAI API key
- Cloudflare R2 account (for multi-page crawls)

### Installation

1. Clone and install dependencies:

```bash
npm install
```

2. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your credentials
```

3. Start Redis:

```bash
docker-compose up -d
```

4. Run the development server:

```bash
npm run dev
```

The API will be available at `http://localhost:3000`.

## API Endpoints

### POST /crawl/url

Crawl a single URL and convert to markdown.

**Request:**

```json
{
  "url": "https://example.com/page",
  "priority": "high",
  "instructions": "Focus on code examples",
  "includePatterns": ["/docs"],
  "excludePatterns": ["/api", "/blog"]
}
```

**Response:**

```json
{
  "jobId": "abc123",
  "status": "queued",
  "estimatedTime": "1-2 minutes"
}
```

### POST /crawl/website

Recursively crawl a website.

**Request:**

```json
{
  "url": "https://example.com",
  "crawlDepth": 2,
  "maxPages": 50,
  "priority": "medium",
  "instructions": "Extract documentation only",
  "includePatterns": ["/docs"],
  "excludePatterns": ["/blog"]
}
```

### POST /crawl/sitemap

Crawl URLs from a sitemap.

**Request:**

```json
{
  "sitemapUrl": "https://example.com/sitemap.xml",
  "priority": "low",
  "includePatterns": ["/articles"],
  "excludePatterns": ["/drafts"]
}
```

### GET /crawl/status/:jobId

Check job status and retrieve results.

**Response (completed single URL):**

```json
{
  "jobId": "abc123",
  "status": "completed",
  "result": {
    "url": "https://example.com/page",
    "title": "Page Title",
    "markdown": "# Page Title\n\nContent here...",
    "wordCount": 500,
    "fetchedAt": "2026-03-25T10:30:00Z"
  },
  "createdAt": "2026-03-25T10:28:00Z",
  "completedAt": "2026-03-25T10:30:00Z"
}
```

**Response (completed multi-page):**

```json
{
  "jobId": "xyz789",
  "status": "completed",
  "progress": 100,
  "result": {
    "rootUrl": "https://example.com",
    "totalPages": 47,
    "downloadUrl": "https://storage.example.com/results/xyz789.tar.gz?signature=...",
    "expiresAt": "2026-03-26T10:30:00Z"
  }
}
```

### GET /health

Health check endpoint.

## Authentication

All `/crawl/*` endpoints require an API key:

```bash
Authorization: Bearer your-api-key-here
```

Configure allowed API keys in `.env`:

```
ALLOWED_API_KEYS=key1,key2,key3
```

## Configuration

Key environment variables:

| Variable                  | Description                 | Default                   |
| ------------------------- | --------------------------- | ------------------------- |
| `PORT`                    | Server port                 | 3000                      |
| `REDIS_URL`               | Redis connection URL        | redis://localhost:6379    |
| `OPENAI_API_KEY`          | OpenAI API key              | _required_                |
| `OPENAI_MODEL`            | OpenAI model                | gpt-4o-mini               |
| `R2_ACCOUNT_ID`           | Cloudflare R2 account       | _required for multi-page_ |
| `R2_ACCESS_KEY_ID`        | R2 access key               | _required for multi-page_ |
| `R2_SECRET_ACCESS_KEY`    | R2 secret key               | _required for multi-page_ |
| `R2_BUCKET_NAME`          | R2 bucket name              | _required for multi-page_ |
| `ALLOWED_API_KEYS`        | Comma-separated API keys    | _required_                |
| `MAX_CONCURRENT_REQUESTS` | Max concurrent fetches      | 5                         |
| `REQUEST_TIMEOUT`         | Request timeout (ms)        | 30000                     |
| `RATE_LIMIT_PER_DOMAIN`   | Delay between requests (ms) | 1000                      |

## Development

```bash
# Development with auto-reload
npm run dev

# Type checking
npm run type-check

# Build for production
npm run build

# Run production build
npm start
```

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────┐      ┌──────────────┐
│   Fastify   │─────▶│   BullMQ     │
│   Server    │      │   Queues     │
└─────────────┘      └───────┬──────┘
                             │
                             ▼
                     ┌──────────────┐
                     │   Workers    │
                     │  (3 queues)  │
                     └───────┬──────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌──────────┐   ┌──────────┐   ┌──────────┐
       │ Crawler  │   │ OpenAI   │   │ R2 Store │
       └──────────┘   └──────────┘   └──────────┘
```

## Project Structure

```
src/
├── index.ts              # Entry point
├── server.ts             # Fastify API routes
├── worker.ts             # BullMQ job processor
├── queue.ts              # Queue setup
├── jobState.ts           # Job state management
├── config.ts             # Configuration loader
├── types.ts              # TypeScript types
│
├── fetchers/
│   ├── detect.ts         # Content-type detection
│   ├── html.ts           # HTML fetcher
│   ├── pdf.ts            # PDF fetcher
│   └── docx.ts           # DOCX fetcher
│
├── crawler/
│   ├── patterns.ts       # URL pattern matching
│   ├── url.ts            # Single URL crawler
│   ├── website.ts        # Recursive crawler
│   ├── sitemap.ts        # Sitemap parser
│   └── robots.ts         # Robots.txt handler
│
├── ai/
│   ├── prompts.ts        # System prompts
│   └── processor.ts      # OpenAI integration
│
├── storage/
│   └── r2.ts             # Cloudflare R2 client
│
└── middleware/
    └── auth.ts           # API key authentication
```

## Example Usage

```bash
# 1. Start the service
docker-compose up -d
npm run dev

# 2. Crawl a single page
curl -X POST http://localhost:3000/crawl/url \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://fastify.dev/docs/latest/",
    "priority": "high"
  }'

# Response: {"jobId":"abc123","status":"queued","estimatedTime":"1-2 minutes"}

# 3. Check status
curl http://localhost:3000/crawl/status/abc123

# 4. Crawl a website
curl -X POST http://localhost:3000/crawl/website \
  -H "Authorization: Bearer your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://docs.example.com",
    "crawlDepth": 2,
    "maxPages": 20,
    "includePatterns": ["/docs"],
    "priority": "medium"
  }'
```

## Troubleshooting

**Redis connection failed:**

- Ensure Docker is running: `docker ps`
- Check Redis logs: `docker-compose logs redis`

**OpenAI rate limits:**

- The system automatically retries with exponential backoff
- Consider using a higher tier OpenAI account
- Reduce concurrent workers in [worker.ts](src/worker.ts)

**R2 upload failed:**

- Verify R2 credentials in `.env`
- Check bucket permissions
- Ensure endpoint URL is correct

**Worker not processing jobs:**

- Check worker logs for errors
- Verify Redis connection
- Ensure workers are started (check console output)

## License

MIT
