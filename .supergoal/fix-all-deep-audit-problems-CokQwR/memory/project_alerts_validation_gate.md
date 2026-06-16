# Project Memory: Alerts Validation Gate

The project now has a production alert contract:

- alert config: `config/alerts/production.json`
- validator: `scripts/ops/validate-alerts.ts`
- package script: `validate:alerts`
- runbook: `docs/operations/alerts-routing.md`

`pnpm run ci` now includes `pnpm validate:alerts`. Required alert coverage includes providers, payments, queues, reports, retention, S3/PDF, repair-rate and finance cost anomalies. The validator checks required IDs, thresholds, owner/routing, source queries, local runbook files and secret-shaped values.
