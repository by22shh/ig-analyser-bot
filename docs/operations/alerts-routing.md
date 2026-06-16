# Alerts routing runbook

Owner: engineering on-call with finance and operations backups.

Config: `config/alerts/production.json`

Validator: `pnpm validate:alerts`

## Implementation model

Alerts are defined declaratively, then implemented in the active monitoring backend:

- Sentry: exception/error-rate alerts from server, worker, provider adapters, storage and PDF rendering.
- OpenTelemetry: latency and trace-based views for HTTP handlers, provider calls and worker spans.
- Structured logs: Pino logs with `app`, `env` and `module`; secret and raw payload fields are redacted in `src/config/logger.ts`.
- SQL/dashboard queries: payment events, payment orders, queue backlog, stale leases, report state and usage-cost tables.
- Finance reconciliation: daily/weekly `pnpm finance:reconciliation` output for cost anomalies and outstanding liability.

## Provider Errors

Signals:

- `provider.openrouter.error_rate`
- `provider.apify.error_rate`
- `provider.facecheck.error_rate`

First response:

1. Check `api_usage_events` for provider, operation, status, model and error code.
2. Confirm whether the issue is auth, quota, timeout, response shape or provider outage.
3. If auth/quota is suspected, rotate or top up credentials in the provider console, then update Fly secrets.
4. If response shape changed, disable the affected feature or pin a known-good model/provider until code is patched.
5. Run a staging smoke after the fix and verify usage events return to success.

## Payment Failures

Signals:

- `payment.failed_events`
- `payment.pending_orders_age`

First response:

1. Open `docs/operations/queue-payment-triage.md`.
2. Query failed `payment_events` and aged `payment_orders`.
3. Reconcile with YooKassa/Telegram dashboard before mutating credits.
4. Never manually grant credits unless the provider dashboard confirms the paid charge.
5. Record the incident note with event IDs, order IDs and final credit transaction IDs.

## Queue Backlog

Signals:

- `queue.analysis_backlog`
- `queue.photo_search_backlog`
- `queue.stale_leases`

First response:

1. Check worker health, Fly machine count and database connection headroom.
2. Query `analysis_jobs` and `photo_search_jobs` by status, `queueNextRunAt` and `queueLockedUntil`.
3. If leases are stale, let the recovery loop reclaim them or restart one worker after confirming no active duplicate worker owns the lease.
4. Scale workers only after confirming the database has enough connection capacity.

## Report Failures

Signal:

- `report.failure_rate`

First response:

1. Inspect the failed `analysis_jobs` error code/message and related report rows.
2. Check provider usage events around the failure time.
3. If credits were reserved but not captured/released, use the queue/payment triage runbook before retrying.
4. Re-run a staging analysis fixture before re-enabling the failing path.

## Retention Failures

Signal:

- `retention.failures`

First response:

1. Check whether leader election is active and only one worker owns the retention lease.
2. Inspect storage/delete failures for report artifacts and photo-search inputs.
3. Confirm expired artifacts are not exposed through public links.
4. Re-run retention after the storage/database issue is fixed.

## Storage And PDF

Signals:

- `storage.s3_upload_failures`
- `pdf.render_failures`

First response:

1. Confirm S3 endpoint, bucket, region and write permissions in staging before production changes.
2. Check artifact rows for failed or missing `storageKey`/`publicUrl`.
3. For PDF timeouts, compare report size with `PDF_RENDER_TIMEOUT_SECONDS` and worker memory.
4. If exports are failing for paid reports, pause new export retries until the root cause is fixed.

## Repair Rate And Quality

Signal:

- `analysis.repair_rate_high`

First response:

1. Run `pnpm eval-golden`.
2. Compare repair telemetry, grounding failures and provider/model changes.
3. If repair rate increased after a prompt/model change, roll back that change or tighten the failing validator.
4. Keep the alert open until golden eval and one staging real-profile smoke are stable.

## Cost Anomalies

Signal:

- `finance.cost_anomaly`

First response:

1. Run `pnpm finance:reconciliation --from <start> --to <end> --format json`.
2. Check `providerCosts.actualUsageRub`, `providerCosts.modeledUsageRub` and `anomalies`.
3. If provider cost ratio exceeds `1 / ECON_TARGET_REVENUE_MULTIPLE`, freeze the affected paid feature.
4. Re-run `pnpm audit-economics:defaults` before unfreezing.

## Local And Staging Smoke

Local:

```bash
pnpm validate:alerts
pnpm typecheck
pnpm lint
```

Staging:

1. Send one synthetic provider failure and confirm it reaches Sentry or `api_usage_events`.
2. Create one malformed payment webhook fixture and confirm `payment_events.processingStatus='failed'`.
3. Pause a worker long enough for one queue backlog query to cross threshold, then restore it.
4. Run finance reconciliation against a high-cost fixture and confirm `finance.cost_anomaly` would fire.
5. Confirm no alert payload includes raw webhook bodies, provider credentials, full user identifiers or report content.
