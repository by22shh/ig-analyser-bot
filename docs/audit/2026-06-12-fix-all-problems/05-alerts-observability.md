# Phase 6: Alerts observability

Дата: 2026-06-13 Asia/Novosibirsk

## What changed

Added a declarative production alert contract with validation and routing docs. `pnpm run ci` now invokes alert validation before lint/typecheck/build/test.

## Deliverables

- `config/alerts/production.json`
- `scripts/ops/validate-alerts.ts`
- `docs/operations/alerts-routing.md`
- package script `validate:alerts`
- `pnpm run ci` wiring via `pnpm validate:alerts`

## Alert config excerpt

```json
{
  "id": "payment.failed_events",
  "severity": "critical",
  "owner": "finance",
  "route": "payments-oncall",
  "source": {
    "type": "sql",
    "query": "payment_events where processingStatus='failed'"
  },
  "threshold": {
    "operator": ">",
    "value": 0,
    "unit": "events",
    "window": "5m"
  },
  "runbook": "docs/operations/alerts-routing.md#payment-failures"
}
```

## Required signal coverage

| Signal group | Alert IDs                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------- |
| Providers    | `provider.openrouter.error_rate`, `provider.apify.error_rate`, `provider.facecheck.error_rate` |
| Payments     | `payment.failed_events`, `payment.pending_orders_age`                                          |
| Queue        | `queue.analysis_backlog`, `queue.photo_search_backlog`, `queue.stale_leases`                   |
| Reports      | `report.failure_rate`                                                                          |
| Retention    | `retention.failures`                                                                           |
| S3/PDF       | `storage.s3_upload_failures`, `pdf.render_failures`                                            |
| Repair-rate  | `analysis.repair_rate_high`                                                                    |
| Cost anomaly | `finance.cost_anomaly`                                                                         |

## Validation output

`Alert config validated: config/alerts/production.json; required alerts=14; routes=3`

## Package/workflow diff summary

- Added `validate:alerts` package script.
- Updated `ci` script to run `pnpm validate:alerts`.
- Existing GitHub workflow already runs `pnpm run ci`, so the alert gate is now part of CI.

## Validation

Command logs are under `docs/audit/2026-06-12-fix-all-problems/commands/phase-6/`.

| Command                                        | Exit | Log                   |
| ---------------------------------------------- | ---: | --------------------- |
| `pnpm exec tsx scripts/ops/validate-alerts.ts` |    0 | `validate-alerts.log` |
| `pnpm typecheck`                               |    0 | `typecheck.log`       |
| `pnpm lint`                                    |    0 | `lint.log`            |
| `pnpm validate:alerts`                         |    0 | `package-script.log`  |
