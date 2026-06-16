SUPERGOAL_PHASE_START
Phase: 11 of 12 - Mini App UX Polish
Task: Polish RU/EN copy, payment failure states, WebApp guards and visual smoke evidence.
Type: brownfield, ui, product-quality
Mandatory commands: pnpm exec vitest run tests/unit/mini-app-api.test.ts tests/unit/mini-app-auth.test.ts tests/snapshots/messages.test.ts, pnpm typecheck, pnpm lint, UI smoke command added by this phase if feasible
Acceptance criteria: 5
Evidence required: screenshots, test summary, copy/localization diff
Depends on phases: 8, 10

## Why

The normal paid path works, but RU copy, payment failure clarity and visual regression proof need polish.

## Required skills

- Use `uncodixfy` before changing frontend UI code.
- Use `browser:control-in-app-browser` or Playwright screenshots for local visual verification when feasible.

## Work

- Localize Mini App labels for RU/EN.
- Add explicit payment/API state copy for pending, failed, unavailable, email required, retryable API failures, unauthorized and empty states.
- Guard Telegram WebApp API calls by version/support.
- Add or extend visual smoke fixtures for mobile/desktop, long report, payment error and empty reports.
- Save screenshots under `docs/audit/2026-06-12-fix-all-problems/screenshots/`.

## Acceptance criteria

- [ ] RU mode no longer shows hardcoded English labels for credit/followers/posts/AI chat/payment labels.
- [ ] Mini App distinguishes invoice opened, pending, failed, unavailable, email required, retryable API failure, unauthorized and empty states.
- [ ] Telegram WebApp browser warnings are avoided by version guards or test-safe fallbacks.
- [ ] Visual smoke runs against local app/test fixtures, including mobile and desktop widths, long report, payment error and empty reports.
- [ ] Screenshots are saved and reviewed for text overflow/overlap.

## Mandatory commands

- `pnpm exec vitest run tests/unit/mini-app-api.test.ts tests/unit/mini-app-auth.test.ts tests/snapshots/messages.test.ts`
- `pnpm typecheck`
- `pnpm lint`
- UI smoke command added by this phase, if feasible

## Evidence required

- Screenshot paths.
- Test summary.
- Copy/localization diff summary.

## Dependencies

phases 8, 10

