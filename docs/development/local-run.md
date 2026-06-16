# Local Development

## Services

```bash
docker compose up -d
DATABASE_URL=postgresql://ig_analyser:ig_analyser@localhost:5432/ig_analyser_bot \
DIRECT_URL=postgresql://ig_analyser:ig_analyser@localhost:5432/ig_analyser_bot \
pnpm prisma:migrate
pnpm prisma:generate
```

If local ports are already occupied:

```bash
POSTGRES_PORT=55432 REDIS_PORT=56379 docker compose up -d
DATABASE_URL=postgresql://ig_analyser:ig_analyser@localhost:55432/ig_analyser_bot \
DIRECT_URL=postgresql://ig_analyser:ig_analyser@localhost:55432/ig_analyser_bot \
pnpm prisma:migrate
```

## Bot

For a real Telegram bot in local polling mode:

```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_USE_LONG_POLLING=true
pnpm dev
pnpm dev:worker
```

The server exposes:

- `GET /health`
- `POST /telegram/webhook`
- `POST /webhooks/yookassa`
- `GET /payments/yookassa/return`

## Mock Mode

Leave external provider secrets empty to use mock adapters. Mock mode still uses the same service interfaces and database paths, so Telegram UX, credits, jobs, report persistence and exports can be tested locally.

## Economics Audit

The audit requires modeled provider costs:

```bash
ECON_STANDARD_REPORT_COST_P75_RUB=50 \
ECON_PHOTO_SEARCH_COST_P75_RUB=20 \
ECON_CHAT_MESSAGE_COST_P75_RUB=2 \
ECON_APIFY_PROFILE_COST_RUB=12 \
ECON_FACECHECK_SEARCH_COST_RUB=15 \
ECON_SUPPORT_RESERVE_RUB=5 \
FACECHECK_MAX_COST_RUB=15 \
pnpm audit-economics
```

If any public mode or payment package fails the `3x` guardrail, the command exits non-zero.
`ECON_STANDARD_REPORT_COST_P75_RUB` is the provider/report p75 cost before support reserve; `audit-economics` adds `ECON_SUPPORT_RESERVE_RUB` separately.
