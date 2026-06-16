# Baseline: deep product audit

Дата: 2026-06-12  
Run root: `.supergoal/deep-product-audit-MxrP9V`  
Scope: весь текущий локальный продукт `ig-analyser-telegram-bot`, включая уже существующие uncommitted/untracked изменения.

## Executive baseline

Текущий baseline инженерно здоровый: все обязательные команды фазы 1 завершились с exit code `0`.

Нельзя считать этот baseline "чистым HEAD": рабочее дерево уже содержит пользовательские изменения в коде анализа, economics, OpenRouter/Apify, env/deploy настройках, тестах и eval-артефактах. Эти изменения зафиксированы как входное состояние аудита и не откатывались.

## Repo identity

| Поле    | Значение                                   |
| ------- | ------------------------------------------ |
| HEAD    | `21e69ae78ba19f1ddcbc5786b8169c83121aa00c` |
| Branch  | `main`                                     |
| Node    | `v24.10.0`                                 |
| pnpm    | `10.32.1`                                  |
| npm     | `11.6.0`                                   |
| Package | `ig-analyser-telegram-bot@0.1.0`           |

## Package scripts

| Script                     | Command                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev`                      | `tsx watch src/server.ts`                                                                                                                                 |
| `dev:worker`               | `tsx watch src/worker.ts`                                                                                                                                 |
| `start`                    | `node --import ./dist/src/config/observability.js dist/src/server.js`                                                                                     |
| `start:worker`             | `node --import ./dist/src/config/observability.js dist/src/worker.js`                                                                                     |
| `build`                    | `tsc -p tsconfig.build.json`                                                                                                                              |
| `typecheck`                | `tsc -p tsconfig.json --noEmit`                                                                                                                           |
| `lint`                     | `eslint .`                                                                                                                                                |
| `format:check`             | `prettier --check .`                                                                                                                                      |
| `test`                     | `vitest run`                                                                                                                                              |
| `audit:prod`               | `pnpm audit --prod --audit-level moderate`                                                                                                                |
| `prisma:generate`          | `prisma generate`                                                                                                                                         |
| `prisma:migrate`           | `prisma migrate deploy`                                                                                                                                   |
| `eval-analysis`            | `tsx scripts/eval-analysis-quality.ts`                                                                                                                    |
| `eval-golden`              | `tsx scripts/check-golden-eval.ts`                                                                                                                        |
| `audit-economics`          | `tsx scripts/audit-economics.ts`                                                                                                                          |
| `audit-economics:defaults` | guarded default economics audit with report/chat/photo-search/provider cost env values                                                                    |
| `ci`                       | `pnpm prisma:generate && pnpm audit:prod && pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test && pnpm audit-economics:defaults` |

## Mandatory command results

Logs: `docs/audit/2026-06-12-deep-product-audit/commands/phase-1/`

| Exit | Duration | Command                         | Log                       |
| ---: | -------: | ------------------------------- | ------------------------- |
|    0 |       2s | `pnpm prisma:generate`          | `commands/phase-1/01.log` |
|    0 |      10s | `pnpm audit:prod`               | `commands/phase-1/02.log` |
|    0 |       3s | `pnpm lint`                     | `commands/phase-1/03.log` |
|    0 |       3s | `pnpm format:check`             | `commands/phase-1/04.log` |
|    0 |       5s | `pnpm typecheck`                | `commands/phase-1/05.log` |
|    0 |       4s | `pnpm build`                    | `commands/phase-1/06.log` |
|    0 |       4s | `pnpm test`                     | `commands/phase-1/07.log` |
|    0 |       0s | `pnpm audit-economics:defaults` | `commands/phase-1/08.log` |

## Security audit baseline

`pnpm audit:prod` returned `No known vulnerabilities found` with exit code `0`. Severity summary at audit level `moderate`: no moderate, high, or critical production dependency vulnerabilities reported by pnpm at this run.

## Test baseline

`pnpm test` passed:

| Metric     |                 Result |
| ---------- | ---------------------: |
| Test files |   52 passed, 3 skipped |
| Tests      | 239 passed, 19 skipped |
| Exit code  |                      0 |

Skipped tests are not baseline failures, but later phases must classify whether skipped areas hide launch risk.

## Economics baseline

`pnpm audit-economics:defaults` passed:

| Mode         | Cost RUB | Charged units | Required units | Multiple |
| ------------ | -------: | ------------: | -------------: | -------: |
| standard     |    55.00 |           100 |            100 |    3.01x |
| chat_message |     2.00 |             5 |              4 |    4.14x |
| influencer   |    63.25 |           200 |            115 |    5.24x |

Net RUB/credit floor: `165.60`; YooKassa floor: `184.00`; Stars floor: `165.60`.

## Working tree baseline

`git status --short` at baseline:

```text
 M .env.example
 M .prettierignore
 M fly.toml
 M package.json
 M scripts/eval-public-instagram-profiles.ts
 M src/config/env.ts
 M src/jobs/workers/analysis.worker.ts
 M src/modules/analysis/content-quality.ts
 M src/modules/analysis/context.ts
 M src/modules/analysis/report-builder.ts
 M src/modules/analysis/report-quality.ts
 M src/modules/economics/model.ts
 M src/modules/instagram/apify.adapter.ts
 M src/modules/instagram/types.ts
 M src/modules/llm/openrouter.adapter.ts
 M src/modules/llm/types.ts
 M src/modules/reports/types.ts
 M tests/unit/analysis-context.test.ts
 M tests/unit/report-builder.test.ts
 M tests/unit/report-quality.test.ts
 M tests/unit/report-service.test.ts
?? .supergoal/
?? docs/audit/
?? docs/eval/
?? docs/research/2026-06-12-instagram-profile-eval-current-code-live/
?? docs/research/2026-06-12-instagram-profile-eval-fly-live-codex-current/
?? scripts/check-golden-eval.ts
?? src/modules/analysis/evidence-pack.ts
```

`git diff --stat` for tracked changes:

```text
21 files changed, 453 insertions(+), 49 deletions(-)
```

These files are treated as user-owned/local baseline changes for audit purposes. The audit may add docs and focused tests/fixes, but it must not revert unrelated local changes.

## Provider mode assumptions

| Area              | Baseline assumption                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Telegram bot      | Local tests/mock handlers are mandatory; live bot/webhook checks require secrets and are optional.                        |
| Telegram Mini App | Local/mock route and auth checks are mandatory; real Telegram shell checks are optional without production token/domain.  |
| OpenRouter        | Unit/golden checks are mandatory; live model checks depend on `OPENROUTER_API_KEY`.                                       |
| Apify             | Adapter tests and saved profile fixtures are mandatory; live ingestion depends on `APIFY_TOKEN`.                          |
| FaceCheck         | Adapter/idempotency checks are mandatory; live reverse image search depends on provider credentials and budget.           |
| YooKassa/Stars    | Unit/idempotency/economics checks are mandatory; live payment flow is optional without provider sandbox/live credentials. |
| Fly/Neon          | Config and existing eval docs are mandatory; live deploy/prod mutation is out of scope unless explicitly available.       |

## Local vs Fly production state

Existing 2026-06-12 eval artifacts show a meaningful distinction:

| Artifact                                                                             | Runtime                                                                  | Key baseline signal                                                                                                                                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/research/2026-06-12-instagram-profile-eval-current-code-live/FINDINGS.md`      | temporary current local dist uploaded to Fly with production env secrets | 5/5 profiles completed, 17/17 sections, 17/17 sources, `deliveryHealth=ready`, no leak matches. Local/current-code run has higher metadata coverage for several profiles than deployed Fly. |
| `docs/research/2026-06-12-instagram-profile-eval-fly-live-codex-current/FINDINGS.md` | current Fly production runtime                                           | 5/5 profiles completed, 17/17 sections, 17/17 sources, `deliveryHealth=ready`, no leak matches, but production still used a narrower recent-30-post profile read for several profiles.      |

Therefore later verdicts must answer two different questions:

1. Local repository readiness after current uncommitted work.
2. Currently deployed Fly production readiness before those local changes are deployed.

## Phase 1 classification

| Check                       | Status                     | Evidence                                                       |
| --------------------------- | -------------------------- | -------------------------------------------------------------- |
| Mandatory commands          | PASS                       | 8/8 exit code `0` in `commands/phase-1/summary.tsv`            |
| Production dependency audit | PASS                       | `No known vulnerabilities found`                               |
| Test suite                  | PASS                       | 239 passed, 19 skipped                                         |
| Formatting/lint/type/build  | PASS                       | all exit code `0`                                              |
| Worktree cleanliness        | INTENTIONAL DIRTY BASELINE | existing local changes are explicitly listed and preserved     |
| Local vs Fly distinction    | PASS                       | 2026-06-12 current-code and Fly eval docs are separately cited |
