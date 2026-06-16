# Phase 8: Payment webhook recovery

Дата: 2026-06-13 Asia/Novosibirsk

## What changed

Hardened Telegram webhook setup and YooKassa lost-callback recovery. YooKassa webhook processing and pending-payment polling now share the same reconciliation path, so a missed webhook can be recovered without double-crediting.

## Deliverables

- `src/telegram/webhook.ts`
- `src/modules/payments/payment.service.ts`
- `scripts/ops/reconcile-yookassa-pending.ts`
- `src/modules/payments/failure-taxonomy.ts`
- `docs/operations/yookassa-reconciliation.md`
- package script `payments:reconcile-yookassa`

## Webhook/reconciliation diff excerpt

```ts
export const TELEGRAM_ALLOWED_UPDATES = [
  "message",
  "callback_query",
  "pre_checkout_query"
] as const;

await bot.api.setWebhook(url, {
  allowed_updates: [...TELEGRAM_ALLOWED_UPDATES],
  ...(secretToken ? { secret_token: secretToken } : {})
});
```

```ts
await services.payments.reconcilePendingYooKassaPayments({
  olderThanMinutes: 10,
  limit: 50
});
```

## Recovery behavior

| Scenario                  | Result                                               |
| ------------------------- | ---------------------------------------------------- |
| YooKassa succeeded + paid | order becomes `paid`, credits granted once           |
| YooKassa canceled         | order becomes `payment_canceled`, no credits granted |
| YooKassa still pending    | order remains `pending_payment`, no credits granted  |
| Amount mismatch           | `PAYMENT_AMOUNT_MISMATCH`, no credits granted        |
| Metadata mismatch         | `PAYMENT_METADATA_*_MISMATCH`, no credits granted    |
| Duplicate processed event | no-op, no double-credit                              |
| Missing provider object   | `PAYMENT_PROVIDER_OBJECT_MISSING`                    |

## Runbook excerpt

`docs/operations/yookassa-reconciliation.md` instructs operators to run:

```bash
pnpm payments:reconcile-yookassa -- --older-than-minutes 10 --limit 50
```

It also states that `YOOKASSA_WEBHOOK_ALLOWED_IPS` must remain current when YooKassa is enabled in production.

## Mini App taxonomy

`src/modules/payments/failure-taxonomy.ts` now exposes payment failure categories, retryability and user action hints. Mini App API errors include `error.paymentFailure` for known payment failures.

## Validation

Command logs are under `docs/audit/2026-06-12-fix-all-problems/commands/phase-8/`.

| Command                                                                                                                                                                  | Exit | Log                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---: | ------------------------------------- |
| `pnpm exec vitest run tests/unit/telegram-webhook.test.ts tests/unit/yookassa-adapter.test.ts tests/unit/payment-reconciliation.test.ts tests/unit/mini-app-api.test.ts` |    0 | `vitest-payment-webhook-recovery.log` |
| `pnpm typecheck`                                                                                                                                                         |    0 | `typecheck.log`                       |
| `pnpm lint`                                                                                                                                                              |    0 | `lint.log`                            |
| `pnpm payments:reconcile-yookassa -- --help`                                                                                                                             |    0 | `reconcile-yookassa-help.log`         |
