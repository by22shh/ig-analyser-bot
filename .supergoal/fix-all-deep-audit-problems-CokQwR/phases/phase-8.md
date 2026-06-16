SUPERGOAL_PHASE_START
Phase: 8 of 12 - Payment Webhook Recovery
Task: Harden Telegram webhook explicitness and YooKassa pending-payment recovery.
Type: brownfield, hardening, ops
Mandatory commands: pnpm exec vitest run tests/unit/telegram-webhook.test.ts tests/unit/yookassa-adapter.test.ts tests/unit/payment-reconciliation.test.ts tests/unit/mini-app-api.test.ts, pnpm typecheck, pnpm lint
Acceptance criteria: 5
Evidence required: test summary, webhook/reconciliation diff, recovery docs excerpt
Depends on phases: 2, 5, 7

## Why

Webhook drift and lost payment callbacks are rare, but expensive. The repo should have explicit update allowlists and a reconciliation path.

## Work

- Add explicit Telegram `allowed_updates` configuration and tests.
- Add YooKassa pending-payment reconciliation job/script/service method.
- Validate YooKassa IP allowlist requirements when the feature flag is enabled.
- Add payment failure taxonomy for Mini App.
- Update docs/runbooks.

## Acceptance criteria

- [ ] Telegram webhook setup sends an explicit `allowed_updates` allowlist and tests assert it.
- [ ] YooKassa pending payments can be reconciled by scheduled job or operator script without double-crediting.
- [ ] Reconciliation tests cover succeeded, canceled, pending, amount mismatch, metadata mismatch, duplicate event and missing provider object.
- [ ] YooKassa IP allowlist/runbook freshness is validated when YooKassa feature flag is enabled.
- [ ] Payment failure taxonomy is available for Mini App phase to show clearer states.

## Mandatory commands

- `pnpm exec vitest run tests/unit/telegram-webhook.test.ts tests/unit/yookassa-adapter.test.ts tests/unit/payment-reconciliation.test.ts tests/unit/mini-app-api.test.ts`
- `pnpm typecheck`
- `pnpm lint`

## Evidence required

- Test output summary.
- Diff excerpt for webhook/reconciliation paths.
- Recovery command/runbook excerpt.

## Dependencies

phases 2, 5, 7

