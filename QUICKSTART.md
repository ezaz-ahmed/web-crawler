# Quick Start Guide

## Setup (5 minutes)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# Required immediately
OPENAI_API_KEY=sk-your-openai-api-key-here
ALLOWED_API_KEYS=test-key-123
```

### 3. Start Redis

```bash
docker-compose up -d
```

Verify Redis is running:

```bash
docker ps
```

### 4. Start the Application

```bash
npm run dev
```

You should see:

```
✓ Server listening on port 3000
✓ Workers started (high: 2, medium: 2, low: 1 concurrency)
```

## First Test (2 minutes)

### Test 1: Health Check

```bash
curl http://localhost:3000/health
```

Expected response: `{"status":"healthy",...}`

### Test 2: Single URL Crawl

```bash
curl -X POST http://localhost:3000/crawl/url \
  -H "Authorization: Bearer test-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "priority": "high"
  }'
```

Expected response:

```json
{
  "jobId": "abc123xyz",
  "status": "queued",
  "estimatedTime": "1-2 minutes"
}
```

Save the `jobId` from the response.

### Test 3: Check Job Status

```bash
# Replace abc123xyz with your actual jobId
curl http://localhost:3000/crawl/status/abc123xyz
```

Wait 1-2 minutes for completion. When done, you'll see:

```json
{
  "jobId": "abc123xyz",
  "status": "completed",
  "result": {
    "url": "https://example.com",
    "title": "Example Domain",
    "markdown": "# Example Domain\n\nThis domain is for...",
    "wordCount": 124,
    "fetchedAt": "2026-03-25T..."
  }
}
```

## Common Issues

**Error: "Missing Authorization header"**
→ Add `-H "Authorization: Bearer test-key-123"` to your curl command

**Error: "Invalid API key"**
→ Check that `ALLOWED_API_KEYS` in `.env` matches your Bearer token

**Error: "Redis connection refused"**
→ Run `docker-compose up -d` to start Redis

**Error: "OpenAI API key not found"**
→ Set `OPENAI_API_KEY` in `.env` file

**Job status stuck at "queued"**
→ Check worker logs in the terminal. Worker should be processing jobs.

**Job status is "failed"**
→ Check the `error` field in the status response for details

## Next Steps

1. **Try a website crawl:**

```bash
curl -X POST http://localhost:3000/crawl/website \
  -H "Authorization: Bearer test-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "crawlDepth": 1,
    "maxPages": 5
  }'
```

2. **Test pattern filtering:**

```bash
curl -X POST http://localhost:3000/crawl/url \
  -H "Authorization: Bearer test-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://docs.example.com",
    "includePatterns": ["/docs"],
    "excludePatterns": ["/api"]
  }'
```

3. **Test custom AI instructions:**

```bash
curl -X POST http://localhost:3000/crawl/url \
  -H "Authorization: Bearer test-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "instructions": "Focus only on code examples and technical content"
  }'
```

## Production Deployment

For production, you'll need to:

1. Set up a production Redis instance (e.g., Redis Cloud, AWS ElastiCache)
2. Set `NODE_ENV=production` in `.env`
3. Build the project: `npm run build`
4. Run with: `npm start`
5. Consider using a process manager like PM2 or Docker for deployment

See [README.md](README.md) for full documentation.
