# Phase 7: Provider smoke gate

Дата: 2026-06-13 Asia/Novosibirsk

## What changed

Added a safe staging provider smoke runner with dry-run default, explicit live staging opt-in, per-step selection, missing-env refusal and output redaction.

## Deliverables

- `scripts/smoke/provider-contract-smoke.ts`
- `tests/unit/provider-contract-smoke.test.ts`
- `docs/operations/provider-smoke.md`
- package script `smoke:staging`

## Step coverage

| Step         | Contract covered                                                       |
| ------------ | ---------------------------------------------------------------------- |
| `telegram`   | Webhook URL/secret config and non-mutating `getWebhookInfo` live check |
| `yookassa`   | Test payment creation and metadata round-trip                          |
| `openrouter` | Structured JSON request and text fallback path                         |
| `apify`      | Actor metadata and configured staging dataset sample                   |
| `facecheck`  | Demo/mock/prod mode boundary and token requirement                     |
| `s3`         | Presigned GET URL generation                                           |
| `pdf`        | Playwright Chromium render dependency                                  |

## Dry-run output summary

`pnpm smoke:staging -- --dry-run`:

```text
Provider contract smoke (mode=dry-run, staging=no, steps=7)
PASS telegram: Telegram webhook config dry-run planned
PASS yookassa: YooKassa test payment metadata dry-run planned
PASS openrouter: OpenRouter structured/fallback contract dry-run planned
PASS apify: Apify actor and dataset contract dry-run planned
PASS facecheck: FaceCheck mode boundary dry-run planned
PASS s3: S3 signed URL contract dry-run planned
PASS pdf: PDF render dependency dry-run planned
Summary: pass=7 fail=0 skip=0
```

## Docs excerpt

`docs/operations/provider-smoke.md` states that default mode is dry-run, live mode requires `--live --staging`, live steps refuse to run until required env variables are present, and output is redacted for known credential variables and common secret-shaped strings.

## Validation

Command logs are under `docs/audit/2026-06-12-fix-all-problems/commands/phase-7/`.

| Command                                                           | Exit | Log                                  |
| ----------------------------------------------------------------- | ---: | ------------------------------------ |
| `pnpm exec vitest run tests/unit/provider-contract-smoke.test.ts` |    0 | `vitest-provider-contract-smoke.log` |
| `pnpm smoke:staging -- --dry-run`                                 |    0 | `smoke-staging-dry-run.log`          |
| `pnpm typecheck`                                                  |    0 | `typecheck.log`                      |
| `pnpm lint`                                                       |    0 | `lint.log`                           |
