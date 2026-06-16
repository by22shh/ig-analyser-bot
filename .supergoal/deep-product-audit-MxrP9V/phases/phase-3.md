SUPERGOAL_PHASE_START
Phase: 3 of 8 - Audit User Journeys
Task: Audit Telegram and Mini App user journeys, states, copy, and screenshots.
Type: brownfield, audit, hardening, product-quality
Mandatory commands: pnpm exec vitest run tests/unit/telegram-webhook.test.ts tests/unit/analysis-start.test.ts tests/unit/analysis-keyboard.test.ts tests/unit/payments-keyboard.test.ts tests/unit/mini-app-api.test.ts tests/unit/mini-app-auth.test.ts tests/snapshots/messages.test.ts, pnpm typecheck, pnpm lint
Acceptance criteria: 6
Evidence required: screenshots list, journey checklist, targeted test summary
Depends on phases: 1, 2

## Why

Technical correctness is not enough; the bot and Mini App must feel complete across real user paths and failure states.

## Work

- Write `docs/audit/2026-06-12-deep-product-audit/02-user-journeys.md`.
- Start the app in mock/local mode if needed and use Browser/Playwright for Mini App visual smoke checks.
- Save Mini App screenshots under `docs/audit/2026-06-12-deep-product-audit/screenshots/`.
- Review Telegram command, keyboard, payment, report, photo, settings, cancellation, and admin boundaries.
- Review RU/EN locale samples, HTML escaping, chunking, placeholders, and confusing copy.
- Apply small fixes only for deterministic blockers in normal user paths.

## Acceptance criteria (all must pass - verify each in transcript)

- Telegram flows are audited for `/start`, menu, analyze, photo search consent, report history, report chat, credits, payments, settings, cancellation/reset, and admin boundaries.
- RU and EN locale surfaces are sampled and checked for broken placeholders, unsafe HTML, confusing copy, and missing states.
- Mini App routes are smoke-tested in local/mock mode at mobile and desktop viewport widths, with screenshots saved.
- Empty, loading, error, unauthorized, payment pending/success/failure, and long-content states are explicitly reviewed.
- Snapshot tests and targeted Telegram/Mini App tests pass or failures are classified with evidence.
- Any UX blocker that prevents a normal user from completing the paid analysis path is fixed or marked P0 in the report.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm exec vitest run tests/unit/telegram-webhook.test.ts tests/unit/analysis-start.test.ts tests/unit/analysis-keyboard.test.ts tests/unit/payments-keyboard.test.ts tests/unit/mini-app-api.test.ts tests/unit/mini-app-auth.test.ts tests/snapshots/messages.test.ts`
- `pnpm typecheck`
- `pnpm lint`

## Evidence required in transcript

- Screenshots list with viewport sizes.
- Journey checklist table with pass/fail/skipped and reasons.
- Targeted test output summary.

## Notes

If the local server cannot start because of missing environment services, document the blocker and still run static route/template tests.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/deep-product-audit-MxrP9V/PROTOCOL.md without further
instruction needed here.

