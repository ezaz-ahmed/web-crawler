# Production Deployment Guide

## Architecture

Three components, all run as Docker containers:

| Service | Role |
|---------|------|
| `app` | Fastify API server — handles HTTP requests, enqueues jobs |
| `worker` | BullMQ worker — processes crawl jobs |
| `redis` | Job queue and result store |

App and worker share the same Docker image. Worker is a separate process (`node dist/worker.js`).

---

## Production Docker Image

### CMD

`Dockerfile` defaults to `node dist/index.js`. `docker-compose.yml` overrides via `command:` per service.

### Build the Image

```bash
docker build -t web-crawler:latest .
```

Verify:

```bash
docker run --rm web-crawler:latest node dist/index.js --version
```

### Tag and Push to Registry

**Docker Hub:**

```bash
docker tag web-crawler:latest yourusername/web-crawler:latest
docker push yourusername/web-crawler:latest
```

**GitHub Container Registry (ghcr.io):**

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

docker tag web-crawler:latest ghcr.io/yourusername/web-crawler:latest
docker push ghcr.io/yourusername/web-crawler:latest
```

**AWS ECR:**

```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

docker tag web-crawler:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/web-crawler:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/web-crawler:latest
```

---

## Environment Variables

Copy `.env.example` and fill in all values for production:

```env
PORT=5000
NODE_ENV=production

# Use managed Redis URL in production (not localhost)
REDIS_URL=redis://your-redis-host:6379

# Required
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Format: key1:whsec_secret1,key2:whsec_secret2
ALLOWED_API_KEYS=prod-key-abc:whsec_abc123,...

# Tuning
USER_AGENT=WebCrawlerBot/1.0
MAX_CONCURRENT_REQUESTS=5
REQUEST_TIMEOUT=30000
RATE_LIMIT_PER_DOMAIN=1000
```

**Never commit `.env` with real keys.** Pass via secrets manager or CI/CD env injection.

---

## Option F: Coolify (Recommended — Docker Compose + Auto CI/CD)

Coolify deploys all 3 services (app + worker + redis) from `docker-compose.yml` directly. Auto-deploys on every push to `main` via GitHub webhook — no GitHub Actions needed.

### Prerequisites

- Coolify instance running (self-hosted or Coolify Cloud)
- Repo pushed to GitHub

---

### Step 1 — Create resource in Coolify

1. Coolify dashboard → **New Project** (or pick existing)
2. **+ Add New Resource** → **Docker Compose**
3. Source: **GitHub** → authorize via **GitHub App** (allows Coolify to watch the repo)
4. Select repo: `web-me`, branch: `main`
5. Coolify auto-detects `docker-compose.yml` — confirm path is correct

---

### Step 2 — Set environment variables

In resource **Environment Variables** tab, add all values from `.env.example`.

Coolify writes these to a `.env` file on the server. The `env_file: .env` in `docker-compose.yml` picks them up automatically.

**Minimum required:**

```env
PORT=5000
NODE_ENV=production
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
ALLOWED_API_KEYS=prod-key-abc:whsec_abc123
USER_AGENT=WebCrawlerBot/1.0
MAX_CONCURRENT_REQUESTS=5
REQUEST_TIMEOUT=30000
RATE_LIMIT_PER_DOMAIN=1000
```

> `REDIS_URL` is already hardcoded to `redis://redis:6379` in `docker-compose.yml` — no need to set it manually. Redis runs as a sidecar in the same compose stack.

---

### Step 3 — Deploy once manually

Click **Deploy**. Coolify will:

1. Clone repo from GitHub
2. Build Docker image from `Dockerfile`
3. Spin up all 3 services: `redis`, `app`, `worker`

Check **Logs** tab to confirm all services started.

---

### Step 4 — Enable auto CI/CD

1. Resource **Settings** → toggle **"Auto Deploy"** → **ON**
2. Coolify shows a webhook URL:
   ```
   https://your-coolify.com/webhooks/source/github/events/manual?token=xxxxx
   ```
3. Copy that URL

---

### Step 5 — Wire GitHub webhook

GitHub repo → **Settings** → **Webhooks** → **Add webhook**:

| Field | Value |
|-------|-------|
| Payload URL | Coolify webhook URL from Step 4 |
| Content type | `application/json` |
| Secret | *(leave empty)* |
| Events | **Just the push event** |
| Active | ✓ |

Click **Add webhook**.

---

### How it works after setup

```
git push origin main
  → GitHub fires webhook to Coolify
  → Coolify pulls latest main
  → Builds new Docker image
  → Replaces containers (app + worker)
  → Redis data preserved via volume
```

---

### Optional: health check

Add to `app` service in `docker-compose.yml` so Coolify knows when app is ready:

```yaml
app:
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://localhost:5000/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

Requires a `/health` route in the Fastify app returning `200`.

---

## Option A: VPS with docker-compose (simplest)

Works on any Linux VPS (Ubuntu, Debian, etc.) with Docker installed.

### 1. Provision Redis

Either use the bundled Redis in `docker-compose.yml` (fine for small deployments) or a managed service (see [Production Redis](#production-redis) below).

### 2. Copy files to server

```bash
scp docker-compose.yml .env user@your-server:/app/
```

Or clone the repo on the server.

### 3. Pull and start

```bash
# On the server
cd /app

# Pull latest image (if using registry)
docker compose pull

# Start all services
docker compose up -d

# Check logs
docker compose logs -f app
docker compose logs -f worker
```

### 4. Update deployment

```bash
docker compose pull
docker compose up -d --no-deps app worker
```

### 5. Nginx reverse proxy (optional)

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable HTTPS with Certbot: `certbot --nginx -d api.yourdomain.com`

---

## Option B: Railway

Railway runs both services from one repo automatically.

1. Push code to GitHub
2. Create new Railway project → **Deploy from GitHub repo**
3. Add two services: **app** and **worker**
   - App: set start command `node dist/index.js`
   - Worker: set start command `node dist/worker.js`
4. Add **Redis** plugin — Railway provides `REDIS_URL` automatically
5. Set all env vars in the Railway dashboard
6. Deploy

Railway auto-builds on push using the `Dockerfile`.

---

## Option C: Render

1. Create two **Web Services** on render.com (one for app, one for worker)
   - Worker: set service type to **Background Worker**
2. Connect GitHub repo
3. Set build command: `docker build -t app .`
4. Set start command:
   - App: `node dist/index.js`
   - Worker: `node dist/worker.js`
5. Add **Redis** — use Render Redis or Upstash
6. Set env vars in Render dashboard

---

## Option D: Fly.io

Fly runs containers globally with built-in Redis via Upstash.

```bash
fly auth login
fly launch --no-deploy   # generates fly.toml

# Add Redis
fly redis create --name web-crawler-redis

# Set secrets
fly secrets set OPENAI_API_KEY=sk-...
fly secrets set ALLOWED_API_KEYS=key1:secret1
fly secrets set REDIS_URL=redis://...

# Deploy app
fly deploy

# Deploy worker as separate app
fly apps create web-crawler-worker
fly deploy --app web-crawler-worker --dockerfile Dockerfile
fly scale count 1 --app web-crawler-worker
```

---

## Option E: AWS ECS (Fargate)

1. Push image to ECR (see above)
2. Create ECS cluster
3. Create two **Task Definitions**: one for app, one for worker
   - App task: container command `node dist/index.js`, expose port 5000
   - Worker task: container command `node dist/worker.js`
4. Create **Services** for each task definition
5. Use **ElastiCache** for Redis
6. Use **ALB** (Application Load Balancer) in front of app service
7. Store secrets in **AWS Secrets Manager** or **Parameter Store**, inject via ECS task role

---

## Production Redis

The bundled `redis:7-alpine` in `docker-compose.yml` is fine for single-server deployments. For multi-server or managed options:

| Option | Notes |
|--------|-------|
| **Upstash** | Serverless Redis, free tier, works with Fly/Railway/Vercel |
| **Redis Cloud** | Managed Redis, 30MB free tier |
| **AWS ElastiCache** | Best for ECS/EC2 deployments |
| **Railway Redis** | Auto-provisioned, `$REDIS_URL` injected automatically |

Set `REDIS_URL` to the managed Redis connection string. Format: `redis://[:password@]host:port`

For TLS: `rediss://[:password@]host:port`

---

## Health Check

After deployment, verify:

```bash
curl https://api.yourdomain.com/health
```

Expected: `{"status":"healthy","timestamp":"...","uptime":...}`

---

## Logs

```bash
# docker-compose
docker compose logs -f app
docker compose logs -f worker

# Railway / Render / Fly
# Use their respective dashboard log viewers or CLI tools
```

---

## Scaling

- **App** scales horizontally — multiple replicas behind a load balancer
- **Worker** scales horizontally — BullMQ handles multiple workers on the same queue
- **Redis** is the shared state — do not run multiple isolated Redis instances

To add more workers, increase worker replica count. Each worker picks up jobs from the same BullMQ queue.
