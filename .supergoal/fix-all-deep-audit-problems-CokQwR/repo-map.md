# Repo map

_Generated 2026-06-12 23:40:26_

## Top-level layout
- Dockerfile
- README.md
- SPECIFICATION.md
- dist
- docker-compose.yml
- docs
- eslint.config.js
- fly.toml
- image-1780604452732.webp
- node_modules
- package.json
- pnpm-lock.yaml
- prisma
- public
- scripts
- src
- tests
- tsconfig.build.json
- tsconfig.json
- vitest.config.ts

## Source directories (depth 2)
### `src/`
- src/mini-app
- src/util
- src/config
- src/telegram
- src/telegram/middleware
- src/telegram/locales
- src/telegram/keyboards
- src/telegram/formatters
- src/telegram/handlers
- src/prompts
- src/db
- src/jobs
- src/jobs/workers
- src/modules
- src/modules/payments
- src/modules/llm
- src/modules/analysis
- src/modules/chat
- src/modules/admin
- src/modules/pdf
- src/modules/observability
- src/modules/storage
- src/modules/users
- src/modules/economics
- src/modules/photo-search
- src/modules/instagram
- src/modules/billing
- src/modules/reports

## File counts (top extensions)
- `.json`: 188 files
- `.ts`: 162 files
- `.txt`: 35 files
- `.md`: 35 files
- `.sql`: 13 files
- `.svg`: 4 files
- `.png`: 4 files
- `.yml`: 2 files
- `.toml`: 2 files
- `.js`: 2 files

## Largest source files (top 15 by line count)
- `scripts/openrouter-model-research.ts` (1251 lines)
- `src/modules/payments/payment.service.ts` (1235 lines)
- `src/modules/llm/openrouter.adapter.ts` (1108 lines)
- `src/modules/analysis/report-builder.ts` (1069 lines)
- `public/mini-app/app.js` (1025 lines)
- `tests/unit/report-builder.test.ts` (887 lines)
- `src/modules/analysis/context.ts` (804 lines)
- `src/mini-app/routes.ts` (766 lines)
- `prisma/migrations/202606030001_init/migration.sql` (743 lines)
- `public/mini-app/styles.css` (705 lines)
- `prisma/schema.prisma` (635 lines)
- `tests/unit/openrouter-empty.test.ts` (629 lines)
- `src/jobs/workers/analysis.worker.ts` (609 lines)
- `src/telegram/locales/ru.ts` (568 lines)
- `src/telegram/locales/en.ts` (560 lines)

## Test surface
- Directories named `tests`: 1
- Directories named `specs`: 1
- Test files (by name pattern): 56

## Notable config / infra
- `.github/workflows`
- `.prettierrc`
- `Dockerfile`
- `docker-compose.yml`
- `eslint.config.js`
- `fly.toml`
- `prisma/schema.prisma`
- `tsconfig.json`
- `vitest.config.ts`

## Recent activity (last 10 commits)
- `21e69ae` 2026-06-12 Deploy to Fly from main CI
- `ed7b7de` 2026-06-12 Harden Instagram report delivery gate
- `ad1edf5` 2026-06-12 Hardening audit fixes and evaluation artifacts
- `6dc20d9` 2026-06-10 Fix observability preload and worker coordination
- `4655dd0` 2026-06-10 Fix mini app payments and production guards
- `b256b84` 2026-06-10 Fix mock YooKassa amounts for public packages
- `6a81c90` 2026-06-10 Harden practical reports and public YooKassa packages
- `75d8e46` 2026-06-10 Strengthen practical report sections and content-quality repair
- `3b2fbdf` 2026-06-09 Harden Instagram profile analysis reports
- `569eaa8` 2026-06-08 Harden report output quality from prod eval

## Files churned in last 20 commits (top 10)
- `src/modules/llm/openrouter.adapter.ts` (12×)
- `src/modules/analysis/report-builder.ts` (8×)
- `tests/unit/report-builder.test.ts` (7×)
- `tests/unit/mini-app-api.test.ts` (7×)
- `src/config/env.ts` (7×)
- `tests/unit/openrouter-empty.test.ts` (6×)
- `src/prompts/report.standard.v1.ts` (6×)
- `src/mini-app/routes.ts` (6×)
- `src/jobs/workers/analysis.worker.ts` (6×)
- `.env.example` (6×)

_End repo map._
