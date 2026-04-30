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
- **Inline multi-page results** returned directly in status response

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for Redis)
- OpenAI API key

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

Full API documentation (endpoints, authentication, configuration, responses, and error formats) is available in [API.md](API.md).

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
            ┌──────────┐   ┌──────────┐
            │ Crawler  │   │ OpenAI   │
            └──────────┘   └──────────┘
```

## Folder Structure Summary

- `src/app.ts`: Builds and wires the Fastify app (routes, middleware, plugins)
- `src/server.ts`: Boring server lifecycle only (start/stop)
- `src/index.ts`: Process bootstrap and graceful shutdown orchestration
- `src/workers/`: Background worker entrypoints
- `src/modules/`: Feature modules with route/controller/service/domain logic
- `src/plugins/`: Shared infrastructure adapters (Redis, etc.)
- `src/config/`: Environment loading and validation
- `src/middleware/`: Cross-cutting HTTP middleware
- `src/utils/`: Shared utility helpers

Current production-oriented tree:

```text
src/
├── app.ts
├── index.ts
├── server.ts
├── worker.ts
├── queue.ts
├── types.ts
├── config.ts
│
├── config/
│   ├── env.ts
│   └── validation.ts
│
├── modules/
│   └── crawl/
│       ├── crawl.route.ts
│       ├── crawl.controller.ts
│       ├── crawl.service.ts
│       ├── crawl.schema.ts
│       ├── processor.ts
│       ├── prompt.ts
│       ├── webhook.ts
│       ├── job.ts
│       ├── crawlers/
│       │   ├── single-url.ts
│       │   ├── website.ts
│       │   ├── sitemap.ts
│       │   ├── patterns.ts
│       │   └── robots.ts
│       └── fetchers/
│           ├── http.fetcher.ts
│           ├── detect.fetcher.ts
│           ├── html.fetcher.ts
│           ├── pdf.fetcher.ts
│           └── docx.fetcher.ts
│
├── workers/
│   └── crawl.worker.ts
│
├── plugins/
│   └── redis.ts
│
├── middleware/
│   ├── auth.ts
│   ├── error-handler.ts
│   └── request-logger.ts
│
└── utils/
    └── logger.ts
```

## Troubleshooting

**Redis connection failed:**

- Ensure Docker is running: `docker ps`
- Check Redis logs: `docker-compose logs redis`

**OpenAI rate limits:**

- The system automatically retries with exponential backoff
- Consider using a higher tier OpenAI account
- Reduce concurrent workers in [worker.ts](src/worker.ts)

**Worker not processing jobs:**

- Check worker logs for errors
- Verify Redis connection
- Ensure workers are started (check console output)

## License

MIT
