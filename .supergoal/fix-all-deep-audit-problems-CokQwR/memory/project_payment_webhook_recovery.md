# Project Memory: Payment Webhook Recovery

Payment recovery hardening is now in place:

- Telegram webhook setup uses `TELEGRAM_ALLOWED_UPDATES` from `src/telegram/webhook.ts`.
- YooKassa webhook and pending-payment polling share `PaymentService.reconcileYooKassaPayment`.
- Operator CLI: `pnpm payments:reconcile-yookassa -- --older-than-minutes 10 --limit 50`.
- Runbook: `docs/operations/yookassa-reconciliation.md`.
- Mini App payment errors include taxonomy via `src/modules/payments/failure-taxonomy.ts`.

The YooKassa reconciliation path handles succeeded, canceled, pending, amount mismatch, metadata mismatch, duplicate event and missing provider object without double-crediting.
