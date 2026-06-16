SUPERGOAL_PHASE_START
Phase: 5 of 8 - Audit Integrations
Task: Audit external providers, official contracts, idempotency, retries, and failure modes.
Type: brownfield, audit, hardening, product-quality
Mandatory commands: pnpm exec vitest run tests/unit/apify-map.test.ts tests/unit/yookassa-adapter.test.ts tests/unit/invoice-payload.test.ts tests/unit/payment-package-visibility.test.ts tests/unit/photo-search-idempotency.test.ts tests/unit/facecheck.test.ts tests/unit/llm-request.test.ts tests/unit/openrouter-empty.test.ts tests/unit/telegram-rate-limit.test.ts, pnpm audit:prod, pnpm typecheck, pnpm lint
Acceptance criteria: 7
Evidence required: provider contract checklist, targeted test summary, failure-mode matrix
Depends on phases: 1, 2, 4

## Why

The product depends on external contracts; adapter correctness, idempotency, retries, and failure classification decide real reliability.

## Work

- Write `docs/audit/2026-06-12-deep-product-audit/04-integrations-failures.md`.
- Audit Telegram Bot API, Telegram Mini App initData, YooKassa, OpenRouter, Apify, FaceCheck, storage, and PDF integration boundaries.
- Compare implementation behavior against the official docs listed in `.supergoal/deep-product-audit-MxrP9V/tools.md`.
- Review provider mode switches and mock/real behavior for safe production defaults.
- Apply focused tests/fixes only for deterministic provider-contract defects.

## Acceptance criteria (all must pass - verify each in transcript)

- Telegram webhook handling has pass/fail/skipped rows against current Bot API expectations, including secret token, update deduplication, allowed update assumptions, and long-polling/webhook mode separation.
- Mini App initData validation has pass/fail/skipped rows against Telegram HMAC/auth_date requirements.
- YooKassa payment/refund creation and webhook reconciliation have pass/fail/skipped rows for `Idempotence-Key` uniqueness, <=64 character behavior, duplicate event safety, and status lifecycle handling.
- OpenRouter requests have pass/fail/skipped rows for structured outputs, model/provider fallback, timeouts, empty responses, and response validation.
- Apify profile ingestion has pass/fail/skipped rows for actor lifecycle, 401/402/timeout failures, dataset mapping, identity mismatch, private/not-found profiles, and result limits.
- FaceCheck, S3/local storage, PDF, and provider mock/real mode switches have pass/fail/skipped rows for safe fallback behavior.
- All integration findings include severity, affected files, reproducibility, and whether a fix was applied.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm exec vitest run tests/unit/apify-map.test.ts tests/unit/yookassa-adapter.test.ts tests/unit/invoice-payload.test.ts tests/unit/payment-package-visibility.test.ts tests/unit/photo-search-idempotency.test.ts tests/unit/facecheck.test.ts tests/unit/llm-request.test.ts tests/unit/openrouter-empty.test.ts tests/unit/telegram-rate-limit.test.ts`
- `pnpm audit:prod`
- `pnpm typecheck`
- `pnpm lint`

## Evidence required in transcript

- Provider contract checklist with official-doc references.
- Targeted test output summary.
- Failure-mode matrix by provider.

## Notes

Keep official-doc excerpts short; link sources rather than copying large documentation blocks.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/deep-product-audit-MxrP9V/PROTOCOL.md without further
instruction needed here.
