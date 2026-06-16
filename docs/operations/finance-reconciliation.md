# Finance reconciliation runbook

Owner: finance operator with engineering backup.

Cadence: weekly before launch, then every Monday for the previous UTC week.

## Export

Run JSON for archival and TSV for spreadsheet review:

```bash
pnpm finance:reconciliation --from 2026-06-01 --to 2026-06-08 --format json --output finance-2026-06-01.json
pnpm finance:reconciliation --from 2026-06-01 --to 2026-06-08 --format tsv --output finance-2026-06-01.tsv
```

The export intentionally omits raw webhook payloads, user identifiers and provider payment identifiers. Failed event samples are redacted before output.

## Weekly checks

1. Confirm gross paid orders by provider/currency match YooKassa and Telegram Stars dashboards.
2. Confirm successful refunds match provider dashboards and that failed refunds are resolved or documented.
3. Compare `credits.soldUnits`, `credits.consumedUnits`, `credits.refundedUnits` and current `liability.balanceUnits`.
4. Review `liability.outstandingNetRevenueRub` as deferred delivery exposure for unspent credits.
5. Review `providerCosts.actualUsageRub` from `api_usage_events` and `providerCosts.modeledUsageRub` derived from the economics model.
6. Triage every `failedEvents` entry before closing the week.
7. Attach the JSON export to the weekly close note and keep the TSV as the operator-facing sheet.

## Go/no-go thresholds

The export derives thresholds from `ECON_TARGET_REVENUE_MULTIPLE`.

- `maxProviderCostToNetRevenueRatio = 1 / ECON_TARGET_REVENUE_MULTIPLE`.
- `providerCostOverrunRatio = max(25%, 1 / ECON_TARGET_REVENUE_MULTIPLE)`.
- `unknownCaptureUnits` must be zero; otherwise some consumed credits cannot be mapped to `standard`, `influencer`, `hr`, `osint_compliance`, `photo_search` or `chat_message`.
- `failedEvents.count` must be zero before launch or weekly close unless an incident note explains the residual item.
- Any negative credit liability or provider/currency net payment total is a launch blocker.

## SQL spot checks

Use these queries when the export and dashboards disagree:

```sql
SELECT provider, currency, status, COUNT(*), SUM("amountMinor")
FROM payment_orders
WHERE "createdAt" >= $1 AND "createdAt" < $2
GROUP BY provider, currency, status
ORDER BY provider, currency, status;

SELECT provider, currency, status, COUNT(*), SUM("amountMinor")
FROM payment_refunds
WHERE "createdAt" >= $1 AND "createdAt" < $2
GROUP BY provider, currency, status
ORDER BY provider, currency, status;

SELECT type, COUNT(*), SUM("amountUnits")
FROM credit_transactions
WHERE "createdAt" >= $1 AND "createdAt" < $2
GROUP BY type
ORDER BY type;

SELECT SUM("balanceUnits") AS balance_units, SUM("reservedUnits") AS reserved_units
FROM credit_accounts;

SELECT provider, operation, status, SUM("costEstimateRub")
FROM api_usage_events
WHERE "createdAt" >= $1 AND "createdAt" < $2
GROUP BY provider, operation, status
ORDER BY provider, operation, status;
```

## Close criteria

- Provider dashboards reconcile to export totals within documented rounding differences.
- `anomalies` is empty or every item has an incident/runbook note.
- Refund credits and monetary refunds point to the same provider/order scope.
- Outstanding liability is reviewed against cash balance and support capacity.
- The economics audit still passes for current defaults.
