# ZRETI Telegram Bot

Production-ready MVP implementation of the ZRETI Telegram bot based on `ig-analyser-site`.

The bot is backend-first: Telegram handlers are thin, long work is queued in BullMQ, state lives in PostgreSQL, provider-specific code sits behind adapters, and local mock mode works without external secrets.

## What Is Implemented

- Telegram UX with `grammy`: `/start`, `/menu`, `/analyze`, `/photo`, `/history`, `/credits`, `/balance`, `/buy`, `/topup`, `/settings`, `/help`, `/cancel`, `/reset`, `/delete_me`, admin shell.
- Public Instagram username normalization and analysis wizard.
- BullMQ workers for analysis and photo search.
- Mock and real adapters for Apify, OpenRouter, FaceCheck, YooKassa, storage and PDF.
- Report generation pipeline: profile snapshots, metrics, Digital Circle, parsed sections, Telegram summary, Markdown/HTML/PDF artifacts, report chat.
- Credits ledger with transactional reserve/capture/release/grant.
- Telegram Stars invoices, pre-checkout validation, successful-payment idempotent grants and Stars refund method.
- YooKassa payment creation and webhook reconciliation with idempotent grants.
- Prisma schema and initial migration for users, settings, payments, ledger, reports, jobs, artifacts, usage events and audit logs.
- RU/EN locale helpers, HTML escaping, chunking and snapshot tests for core UX screens.
- `pnpm audit-economics` guardrail for provider costs, runtime caps, Stars/YooKassa floors and public mode pricing.
- Dockerfiles, Docker Compose and GitHub Actions CI.

## Local Start

```bash
pnpm install
docker compose up -d
cp .env.example .env
pnpm prisma:migrate
pnpm prisma:generate
pnpm dev
pnpm dev:worker
```

Without `APIFY_TOKEN`, `OPENROUTER_API_KEY`, `FACECHECK_API_TOKEN`, `YOOKASSA_SHOP_ID` and `YOOKASSA_SECRET_KEY`, providers run in mock mode. This lets the end-to-end UX complete locally without secrets.

For Neon, use the pooled connection string as `DATABASE_URL` and the direct connection string as `DIRECT_URL`. Redis is still required separately for BullMQ workers; both `redis://` and TLS `rediss://` URLs are supported.

For Telegram local development, set:

```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_USE_LONG_POLLING=true
```

Production should use webhook mode:

```bash
TELEGRAM_WEBHOOK_URL=https://your-domain.example/telegram/webhook
TELEGRAM_WEBHOOK_SECRET=...
```

For Fly.io + Neon deployment, use [docs/deployment/fly-neon.md](./docs/deployment/fly-neon.md). The Fly config runs `web` and `worker` as separate process groups and runs Prisma migrations through the release command before each release.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
ECON_STANDARD_REPORT_COST_P75_RUB=55 \
ECON_PHOTO_SEARCH_COST_P75_RUB=20 \
ECON_CHAT_MESSAGE_COST_P75_RUB=2 \
ECON_APIFY_PROFILE_COST_RUB=12 \
ECON_FACECHECK_SEARCH_COST_RUB=15 \
ECON_SUPPORT_RESERVE_RUB=5 \
FACECHECK_MAX_COST_RUB=15 \
pnpm audit-economics
```

`pnpm audit-economics` intentionally fails when required provider cost variables are missing.
Use `pnpm run ci` to run the full local CI script with the same economics variables.

## Provider Modes

- Apify: real when `APIFY_TOKEN` is set, otherwise mock profile data.
- OpenRouter: real when `OPENROUTER_API_KEY` is set, otherwise mock vision/report/chat.
- FaceCheck: real when `FACECHECK_API_TOKEN` is set and `FACECHECK_TESTING_MODE=false`, otherwise mock candidates.
- YooKassa: real when shop credentials are set, otherwise mock checkout URL.
- Storage: S3-compatible when S3 env vars are set, otherwise local `.data/artifacts`.

## Documents

- [SPECIFICATION.md](./SPECIFICATION.md)
- [docs/source-project-analysis.md](./docs/source-project-analysis.md)
- [docs/financial-model.md](./docs/financial-model.md)
- [docs/sibling-bot-ux-reference.md](./docs/sibling-bot-ux-reference.md)
- [docs/development/local-run.md](./docs/development/local-run.md)
- [docs/deployment/fly-neon.md](./docs/deployment/fly-neon.md)

## Safety

ZRETI analyzes public data only. HR mode is feature-flagged, OSINT/compliance is role-gated, photo search requires user confirmation, and risky outputs are phrased as hypotheses/signals/checks. The bot refuses harassment, doxing, pressure tactics, privacy bypass and private-profile analysis.
