# Fix-all baseline

Дата: 2026-06-13 Asia/Novosibirsk  
Run root: `.supergoal/fix-all-deep-audit-problems-CokQwR`  
Scope: исправить все repo-addressable P1/P2/P3 проблемы из deep audit без отката пользовательских baseline changes.

## Repo identity

| Поле    | Значение                                   |
| ------- | ------------------------------------------ |
| HEAD    | `21e69ae78ba19f1ddcbc5786b8169c83121aa00c` |
| Branch  | `main`                                     |
| Node    | `v24.10.0`                                 |
| pnpm    | `10.32.1`                                  |
| npm     | `11.6.0`                                   |
| Package | `ig-analyser-telegram-bot@0.1.0`           |

## Previous audit artifacts

- `docs/audit/2026-06-12-deep-product-audit/FINAL-AUDIT.md`
- `docs/audit/2026-06-12-deep-product-audit/BEST-IN-CLASS-GAP-ANALYSIS.md`
- `docs/audit/2026-06-12-deep-product-audit/01-architecture-data-invariants.md`
- `docs/audit/2026-06-12-deep-product-audit/02-user-journeys.md`
- `docs/audit/2026-06-12-deep-product-audit/03-analysis-quality.md`
- `docs/audit/2026-06-12-deep-product-audit/04-integrations-failures.md`
- `docs/audit/2026-06-12-deep-product-audit/05-security-privacy.md`
- `docs/audit/2026-06-12-deep-product-audit/06-economics-ops.md`

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
| `format`                   | `prettier --write .`                                                                                                                                      |
| `format:check`             | `prettier --check .`                                                                                                                                      |
| `test`                     | `vitest run`                                                                                                                                              |
| `audit:prod`               | `pnpm audit --prod --audit-level moderate`                                                                                                                |
| `prisma:generate`          | `prisma generate`                                                                                                                                         |
| `prisma:migrate`           | `prisma migrate deploy`                                                                                                                                   |
| `eval-analysis`            | `tsx scripts/eval-analysis-quality.ts`                                                                                                                    |
| `eval-golden`              | `tsx scripts/check-golden-eval.ts`                                                                                                                        |
| `audit-economics`          | `tsx scripts/audit-economics.ts`                                                                                                                          |
| `audit-economics:defaults` | guarded default economics audit with report/chat/photo-search/provider/support env values                                                                 |
| `ci`                       | `pnpm prisma:generate && pnpm audit:prod && pnpm lint && pnpm format:check && pnpm typecheck && pnpm build && pnpm test && pnpm audit-economics:defaults` |

## Mandatory command results

Logs: `docs/audit/2026-06-12-fix-all-problems/commands/phase-1/`

| #   | Command                                   | Exit | Classification                                                                            | Log                                                |
| --- | ----------------------------------------- | ---: | ----------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | `pnpm run ci`                             |    0 | pass                                                                                      | `commands/phase-1/01-ci.log`                       |
| 2   | `pnpm eval-golden`                        |    0 | pass                                                                                      | `commands/phase-1/02-eval-golden.log`              |
| 3   | `pnpm exec prisma validate`               |    1 | environment-only: local shell lacks `DIRECT_URL`; no product/schema defect                | `commands/phase-1/03-prisma-validate.log`          |
| 4   | env-qualified `pnpm exec prisma validate` |    0 | pass: schema validates when `DATABASE_URL` and `DIRECT_URL` are provided with test values | `commands/phase-1/04-prisma-validate-with-env.log` |

Important baseline note: later phases should use an env-qualified Prisma validation command or provide a local script that supplies safe test URLs. The raw Prisma schema is valid; the plain command failure is caused by missing required environment, not by schema drift.

## CI baseline summary

`pnpm run ci` passed:

- Prisma generate: pass
- Production dependency audit: no known vulnerabilities
- Lint: pass
- Format check: pass
- Typecheck: pass
- Build: pass
- Tests: 52 files passed, 3 skipped; 239 tests passed, 19 skipped
- Economics defaults: pass under current pre-fix model, with the known support-reserve caveat

`pnpm eval-golden` passed for 5 profiles in `docs/research/2026-06-12-instagram-profile-eval-current-code-live`.

## Working tree baseline

`git status --short` at phase start included existing user-owned tracked changes:

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

Tracked `git diff --stat` at phase start:

```text
21 files changed, 453 insertions(+), 49 deletions(-)
```

These tracked changes predate this fix-all implementation run and are treated as user-owned baseline changes. Phase 1 created only fix-run planning/audit artifacts and command logs.

## Baseline conclusion

The repository starts from a green CI/golden-eval baseline. The one failing command is classified as environment-only because raw Prisma validation needs `DIRECT_URL`; the schema validates with safe test DB URLs. This run can proceed to product/ops/security fixes without first repairing unrelated test/build failures.
