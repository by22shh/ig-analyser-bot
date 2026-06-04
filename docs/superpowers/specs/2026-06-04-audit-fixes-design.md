# Audit Fixes — Design

Date: 2026-06-04
Branch: `codex/fix-audit-findings`

Fixes the findings from the deep audit. Grouped by risk. Approved approaches noted inline.

## A. Payment & money robustness

### A1. Stars payment recovery on processing failure

**Problem:** `/telegram/webhook` always returns `{ ok: true }` (grammy `bot.catch` swallows handler errors), so Telegram never re-delivers a failed update. The `TELEGRAM_STARS_RECONCILIATION_ENABLED` flag is declared but unused — there is no recovery path. A transient failure while granting Stars credits silently loses a paid user's credits.

**Approach (approved):** Make the webhook return HTTP 500 when the update failed, so Telegram retries. The dedup middleware already re-processes `failed` updates (`claimUpdate` re-claims when status is not `processed` and not `processing`-within-TTL), and all handlers are idempotent, so retry is safe.

- In `src/app.ts`, after `bot.handleUpdate(update)`, look up the `telegramUpdate` row by `update_id`. If its status is `failed`, `reply.code(500)` and return `{ ok: false }`. Otherwise return `{ ok: true }`.
- If `update_id` is missing or the row is absent (dedup failed open), return 200 (cannot determine; rare DB-error path).
- Remove `TELEGRAM_STARS_RECONCILIATION_ENABLED` from `src/config/env.ts` and `.env.example` (dead config).

YooKassa already returns 500 on failure, so no change there.

### A2. Integration tests for the money paths

**Problem:** The riskiest code (credit ledger, payment webhooks, idempotency) has zero direct tests. All 38 existing tests are pure-function unit tests.

**Approach:** Add Postgres-backed integration tests. CI already runs `prisma migrate deploy` before `pnpm test`, so the DB is available there. Locally without a DB the suites auto-skip.

- `tests/integration/credits.service.test.ts`: reserve→capture, reserve→release, insufficient credits throws `InsufficientCreditsError`, idempotent grant, scoped vs unscoped capture/release, `debit` guard when funds spent.
- `tests/integration/payments.webhook.test.ts`: Telegram Stars double-delivery grants once (same `telegramPaymentChargeId`); YooKassa `payment.succeeded` grants once and is idempotent; amount/currency mismatch is rejected without granting.
- DB availability detected via a top-level `SELECT 1` probe; suites use `describe.skipIf(!dbAvailable)`. Each test uses random `telegramId`s and cleans up created users (cascade) in `afterAll`. Use the Mock YooKassa adapter for `getPayment`.

## B. Correctness / UX

### B1. `/delete_me` confirmation (approved: inline button)

**Problem:** `/delete_me` irreversibly anonymizes the account and deletes reports/artifacts with no confirmation.

**Approach:** `/delete_me` shows a warning with inline buttons "Yes, delete" / "Cancel". Deletion runs only on a new callback `CB.DELETE_ME_CONFIRM`. Cancel clears via the existing menu. Add `DELETE_ME_CONFIRM` to `CB`, a confirm-prompt + done strings to RU/EN locales, and handle the callback in `profile.ts`.

### B2. Bounded-concurrency vision

**Problem:** `OpenRouterLlmProvider.analyzeVision` processes posts strictly sequentially; `VISION_BATCH_SIZE` is never used for batching (only audited as a cap).

**Approach:** Process posts through a bounded-concurrency pool of size `VISION_BATCH_SIZE` (default 5), preserving result order and keeping per-post try/catch (a failed post yields a `failed` item, never rejects the batch). Extract a small reusable `mapWithConcurrency(items, limit, fn)` helper and unit-test it (order preserved, concurrency capped, per-item errors isolated).

## C. Infrastructure / ops

### C1. Graceful shutdown

Add SIGTERM/SIGINT handlers:

- `src/worker.ts`: `worker.close()` for both BullMQ workers (waits for active jobs), clear the retention interval, `prisma.$disconnect()`.
- `src/server.ts`: `app.close()`, stop long-polling bot if running, `prisma.$disconnect()`.
  Shutdown is idempotent (guard against double-invoke) and exits the process when done.

### C2. Retention resilience under >1 worker

In `RetentionService.cleanupExpiredReports`, wrap each report's storage+DB cleanup in try/catch so a concurrent "already deleted" race (or one bad report) does not abort the whole batch. Return the count actually cleaned.

### C3. Migration drift guard in CI

Add a CI step (after `prisma migrate deploy`) that fails on schema/migration drift:
`prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code`
(exit 2 = drift → step fails). No shadow DB needed because the live DB is already migrated.

## D. Cleanup (minor)

- **D1.** Delete the unused duplicate `Dockerfile.worker` (Fly builds only `Dockerfile` and runs both process groups from it; grep confirms no references).
- **D2.** `renderMainMenu` (`helpers.ts`) drops the redundant second account fetch — use `credits.snapshot` for balance and remove the `profileStats` call there.
- **D3.** Add a clarifying comment at the free-text-username branch in `analyze.ts` documenting it as intentional (behavior unchanged, per decision).

## Out of scope (YAGNI)

- HTML download button: HTML is only a PDF source; no user demand.
- YooKassa webhook HMAC: provider does not sign webhooks; re-fetch already authoritative.
- Free-text-username behavior change: kept as a deliberate UX (D3 only documents it).

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` green.
- `pnpm audit-economics` (with the documented ECON\_\* vars) green.
- New integration tests pass against a local Postgres (docker compose) and in CI.
