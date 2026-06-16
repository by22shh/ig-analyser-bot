# Stack context

_Generated 2026-06-12 17:03:12_

## Language signals
- **Node/JS/TS** — package.json present
  - Name: `ig-analyser-telegram-bot`, version: `0.1.0`
  - Top dependencies: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, @eslint/js, @fastify/rate-limit, @opentelemetry/api, @opentelemetry/auto-instrumentations-node, @opentelemetry/exporter-trace-otlp-http, @opentelemetry/sdk-node, @prisma/client, @sentry/node, @types/node, bullmq, dotenv, eslint, fastify
  - Framework: **fastify**

## Package manager
- **pnpm** (pnpm-lock.yaml)

## Likely commands
From package.json scripts:
- `dev` → `tsx watch src/server.ts`
- `dev:worker` → `tsx watch src/worker.ts`
- `start` → `node --import ./dist/src/config/observability.js dist/src/server.js`
- `start:worker` → `node --import ./dist/src/config/observability.js dist/src/worker.js`
- `build` → `tsc -p tsconfig.build.json`
- `typecheck` → `tsc -p tsconfig.json --noEmit`
- `lint` → `eslint .`
- `format` → `prettier --write .`
- `format:check` → `prettier --check .`
- `test` → `vitest run`
- `test:watch` → `vitest`
- `audit:prod` → `pnpm audit --prod --audit-level moderate`
- `prisma:generate` → `prisma generate`
- `prisma:migrate` → `prisma migrate deploy`
- `eval-analysis` → `tsx scripts/eval-analysis-quality.ts`
- `eval-golden` → `tsx scripts/check-golden-eval.ts`
- `audit-economics` → `tsx scripts/audit-economics.ts`
- `audit-economics:defaults` → `ECON_STANDARD_REPORT_COST_P75_RUB=55 ECON_PHOTO_SEARCH_COST_P75_RUB=20 ECON_CHAT_MESSAGE_COST_P75_RUB=2 ECON_APIFY_PROFILE_COST_RUB=12 ECON_FACECHECK_SEARCH_COST_RUB=15 ECON_SUPPORT_RESERVE_RUB=5 FACECHECK_MAX_COST_RUB=15 pnpm audit-economics`
- `ci` → `pnpm prisma:generate && pnpm audit:prod && pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test && pnpm audit-economics:defaults`

## Git
- Branch: `main`
- Remote: git@github.com:by22shh/ig-analyser-bot.git
- Working tree: 26 files changed

## Test / lint heuristics
- Has script: `build`
- Has script: `typecheck`
- Has script: `test`
- Has script: `lint`
- Has script: `ci`
- Has script: `dev`
- Has script: `start`
- TypeScript present (tsconfig.json)

_End stack context._
