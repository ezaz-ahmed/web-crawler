# Quick Start Guide

## Docker Dev Setup (Recommended)

Run the full stack (Redis + app server + worker) with hot reload in one command.

### 1. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` — set your API keys:

```env
OPENAI_API_KEY=sk-your-openai-api-key-here
ALLOWED_API_KEYS=test-key-123:whsec_test_key_123
```

### 2. Start with Docker

```bash
npm run docker:dev:build   # first time (builds image)
npm run docker:dev         # subsequent starts
```

Or directly:

```bash
docker compose -f docker-compose.dev.yml up --build
```

All three services start together:
- **redis** — job queue store
- **app** — API server with hot reload on `src/` changes
- **worker** — job processor with hot reload on `src/` changes

### 3. Verify Running

```bash
curl http://localhost:5000/health
```

Expected: `{"status":"healthy",...}`

### 4. Stop

```bash
npm run docker:dev:down
# or
docker compose -f docker-compose.dev.yml down
```

---

## Manual Dev Setup (without Docker)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
OPENAI_API_KEY=sk-your-openai-api-key-here
ALLOWED_API_KEYS=test-key-123:whsec_test_key_123
```

### 3. Start Redis

```bash
docker compose up -d redis
```

### 4. Start App + Worker

In separate terminals:

```bash
# Terminal 1 — API server
npm run dev

# Terminal 2 — job worker
npm run dev:worker
```

---

## First Test (2 minutes)

### Test 1: Health Check

```bash
curl http://localhost:5000/health
```

Expected: `{"status":"healthy",...}`

### Test 2: Single URL Crawl

```bash
curl -X POST http://localhost:5000/crawl/url \
  -H "Authorization: Bearer test-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "priority": "high"
  }'
```

Expected:

```json
{
  "jobId": "abc123xyz",
  "status": "queued",
  "estimatedTime": "1-2 minutes"
}
```

Save the `jobId`.

### Test 3: Check Job Status

```bash
curl http://localhost:5000/crawl/status/abc123xyz
```

Wait 1-2 minutes. When done:

```json
{
  "jobId": "abc123xyz",
  "status": "completed",
  "result": {
    "url": "https://example.com",
    "title": "Example Domain",
    "markdown": "# Example Domain\n\n...",
    "wordCount": 124,
    "fetchedAt": "2026-..."
  }
}
```

---

## Common Issues

**Error: "Missing Authorization header"**
→ Add `-H "Authorization: Bearer test-key-123"` to your curl command

**Error: "Invalid API key"**
→ Check `ALLOWED_API_KEYS` format: `api_key:webhook_secret` pairs, comma-separated

**Error: "Redis connection refused"**
→ Run `docker compose -f docker-compose.dev.yml up -d redis`

**Error: "OpenAI API key not found"**
→ Set `OPENAI_API_KEY` in `.env`

**Job status stuck at "queued"**
→ Worker not running. Check worker logs: `docker compose -f docker-compose.dev.yml logs worker`

**Job status is "failed"**
→ Check `error` field in status response

**Docker build fails on Chromium**
→ First build takes a few minutes — Chromium install on Alpine is slow

---

## More Examples

Website crawl:

```bash
curl -X POST http://localhost:5000/crawl/website \
  -H "Authorization: Bearer test-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "crawlDepth": 1,
    "maxPages": 5
  }'
```

Pattern filtering:

```bash
curl -X POST http://localhost:5000/crawl/url \
  -H "Authorization: Bearer test-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://docs.example.com",
    "includePatterns": ["/docs"],
    "excludePatterns": ["/api"]
  }'
```

Custom AI instructions:

```bash
curl -X POST http://localhost:5000/crawl/url \
  -H "Authorization: Bearer test-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "instructions": "Focus only on code examples and technical content"
  }'
```

---

See [deploy.md](deploy.md) for production deployment.
