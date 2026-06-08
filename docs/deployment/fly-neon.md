# Deploy To Fly.io With Neon

This repo is prepared for a Fly.io deployment with two process groups:

- `web`: Fastify HTTP server for health checks, Telegram webhook, YooKassa webhook and payment return page.
- `worker`: queue workers for Instagram analysis, photo search, exports and retention.

The default [fly.toml](../../fly.toml) uses `JOB_QUEUE_DRIVER=postgres`, so the worker claims jobs through Postgres leases and does not need Redis. If you switch to `JOB_QUEUE_DRIVER=bullmq`, add a managed Redis provider separately; both `redis://` and TLS `rediss://` URLs are supported.

## 1. Create Neon Database

Create a Neon project and copy two connection strings:

```bash
DATABASE_URL="postgresql://...-pooler.../dbname?sslmode=require"
DIRECT_URL="postgresql://.../dbname?sslmode=require"
```

Use the pooled URL with `-pooler` as `DATABASE_URL` for runtime traffic. Use the direct URL without `-pooler` as `DIRECT_URL` for Prisma migrations and schema tasks.

The Prisma schema already contains:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

## 2. Choose Queue Driver

The checked-in Fly config uses:

```toml
JOB_QUEUE_DRIVER = "postgres"
```

In this mode, jobs are leased in Postgres with `queueLockedBy`, `queueLockedUntil`, retry counters and backoff fields. Redis is not required.

If you prefer BullMQ, change `JOB_QUEUE_DRIVER` to `bullmq` and set a Redis URL:

```bash
fly secrets set REDIS_URL="rediss://default:password@host:6379"
```

Plain `redis://` also works for local/private Redis, but production managed Redis is usually `rediss://`.

## 3. Create Fly App

Edit [fly.toml](../../fly.toml):

```toml
app = "your-fly-app-name"
primary_region = "fra"
```

Then create the app:

```bash
fly apps create your-fly-app-name
```

The current `fly.toml` uses:

- `[processes]` for `web` and `worker`.
- `[http_service] processes = ["web"]` so only the web machine receives public HTTP traffic.
- `[deploy] release_command` adds missing Neon timeout parameters and runs `pnpm prisma:migrate` once before the new release starts.

## 4. Set Required Secrets

Replace `your-fly-app-name` and all credentials:

```bash
fly secrets set \
  DATABASE_URL="postgresql://...-pooler.../dbname?sslmode=require&connect_timeout=15&pool_timeout=15" \
  DIRECT_URL="postgresql://.../dbname?sslmode=require&connect_timeout=15" \
  TELEGRAM_BOT_TOKEN="..." \
  TELEGRAM_WEBHOOK_SECRET="replace-with-long-random-string" \
  TELEGRAM_ADMIN_IDS="123456789" \
  APP_BASE_URL="https://your-fly-app-name.fly.dev" \
  TELEGRAM_WEBHOOK_URL="https://your-fly-app-name.fly.dev/telegram/webhook" \
  APIFY_TOKEN="..." \
  OPENROUTER_API_KEY="..." \
  YOOKASSA_SHOP_ID="..." \
  YOOKASSA_SECRET_KEY="..." \
  S3_ENDPOINT="..." \
  S3_BUCKET="..." \
  S3_ACCESS_KEY_ID="..." \
  S3_SECRET_ACCESS_KEY="..."
```

`YOOKASSA_RETURN_URL` can be omitted. The app derives it as:

```text
APP_BASE_URL + /payments/yookassa/return
```

Set it only if you need a custom return URL:

```bash
fly secrets set YOOKASSA_RETURN_URL="https://your-domain.example/payments/yookassa/return"
```

## 5. Set Provider Secrets

The default [fly.toml](../../fly.toml) enables Telegram Stars and real analysis mode in production, while YooKassa is disabled unless you set `FEATURE_YOOKASSA_PAYMENTS=true`. The app intentionally refuses to start in `APP_ENV=production` if enabled integrations would fall back to mock mode.

```bash
fly secrets set \
  APIFY_TOKEN="..." \
  OPENROUTER_API_KEY="..." \
  YOOKASSA_SHOP_ID="..." \
  YOOKASSA_SECRET_KEY="..." \
  S3_ENDPOINT="..." \
  S3_BUCKET="..." \
  S3_ACCESS_KEY_ID="..." \
  S3_SECRET_ACCESS_KEY="..."
```

Optional integrations:

```bash
fly secrets set \
  FACECHECK_API_TOKEN="..." \
  S3_PUBLIC_BASE_URL="..."
```

If YooKassa is enabled, configure this webhook in YooKassa:

```text
https://your-fly-app-name.fly.dev/webhooks/yookassa
```

## 6. Set Economics Guardrails

Before public paid usage, set measured cost assumptions:

```bash
fly secrets set \
  ECON_STANDARD_REPORT_COST_P75_RUB="55" \
  ECON_PHOTO_SEARCH_COST_P75_RUB="20" \
  ECON_CHAT_MESSAGE_COST_P75_RUB="2" \
  ECON_APIFY_PROFILE_COST_RUB="12" \
  ECON_FACECHECK_SEARCH_COST_RUB="15" \
  ECON_SUPPORT_RESERVE_RUB="5" \
  FACECHECK_MAX_COST_RUB="15"
```

Keep `FEATURE_PHOTO_SEARCH=false` until FaceCheck and its cost cap are ready.

## 7. Deploy

Run:

```bash
fly deploy
```

On deploy, Fly builds the Docker image, runs Prisma migrations through the release command, then starts one `web` machine and one `worker` machine.

## 8. Verify Production

```bash
fly status
fly logs
curl https://your-fly-app-name.fly.dev/health
```

Expected health response:

```json
{ "ok": true, "env": "production" }
```

Then open the bot in Telegram and run:

```text
/start
/help
/buy
```

Check that:

- `/help` shows the support/group/docs links.
- Telegram webhook requests appear in `fly logs`.
- Analysis jobs move from Telegram into the worker queue.
- With `JOB_QUEUE_DRIVER=postgres`, active jobs show lease metadata in `analysis_jobs` / `photo_search_jobs` while running and clear it when completed, failed or waiting for retry.
- YooKassa return URL is your Fly URL, not `example.com`.

## 9. Scale

Start conservative:

```bash
fly scale count web=1 worker=1
```

If queue backlog grows, scale workers after confirming the database has enough connection headroom:

```bash
fly scale count worker=2
```

The Postgres queue uses leases and retry counters, so multiple worker machines are supported. The worker process has no public HTTP service.
