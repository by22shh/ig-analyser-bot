# YooKassa pending-payment reconciliation

Owner: finance operator with engineering backup.

Command:

```bash
pnpm payments:reconcile-yookassa -- --older-than-minutes 10 --limit 50
```

## When to run

- YooKassa webhook delivery failed or was delayed.
- `payment.pending_orders_age` alert fired.
- Finance reconciliation shows paid provider charges without matching credit purchases.
- Before weekly finance close when YooKassa is enabled.

## What it does

The command scans aged `payment_orders` with:

- `provider = 'yookassa'`
- `status = 'pending_payment'`
- non-empty `providerPaymentId`

For each order it calls YooKassa `getPayment` and then the same reconciliation path used by the webhook handler.

Outcomes:

- `succeeded` + paid: marks order `paid`, grants credits once, stores YooKassa payment state and updates pending fiscal receipts.
- `canceled`: marks the order `payment_canceled` and stores provider state.
- still pending: leaves the order pending and stores provider state.
- amount/metadata/provider mismatch: returns an error code and does not grant credits.
- already paid locally: stores provider state without granting credits again.

## Safety rules

- Do not manually grant credits before checking provider state.
- Treat any `PAYMENT_AMOUNT_MISMATCH`, `PAYMENT_METADATA_*_MISMATCH` or `PAYMENT_PROVIDER_MISMATCH` as a finance incident.
- Keep `YOOKASSA_WEBHOOK_ALLOWED_IPS` current when YooKassa is enabled in production.
- Use `docs/operations/finance-reconciliation.md` after recovery to verify money, credits and liability.

## Spot checks

```sql
SELECT id, status, "providerPaymentId", "amountMinor", currency, "creditsUnits", "createdAt"
FROM payment_orders
WHERE provider = 'yookassa' AND status = 'pending_payment'
ORDER BY "createdAt" ASC;

SELECT provider, "eventType", "providerObjectId", "processingStatus", "errorCode", "receivedAt"
FROM payment_events
WHERE provider = 'yookassa'
ORDER BY "receivedAt" DESC
LIMIT 50;

SELECT provider, "providerPaymentId", type, "amountUnits", "createdAt"
FROM credit_transactions
WHERE provider = 'yookassa'
ORDER BY "createdAt" DESC
LIMIT 50;
```
