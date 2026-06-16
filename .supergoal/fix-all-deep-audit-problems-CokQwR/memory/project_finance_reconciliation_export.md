# Project Memory: Finance Reconciliation Export

The project now has a finance reconciliation module and CLI:

- pure aggregation/redaction logic in `src/modules/finance/reconciliation.ts`
- CLI in `scripts/finance/export-reconciliation.ts`
- package script `finance:reconciliation`
- runbook in `docs/operations/finance-reconciliation.md`

The export supports JSON/CSV/TSV, half-open date ranges, raw payload/user/payment ID redaction, payment/refund/credit/liability summaries, failed event samples, actual API usage costs and modeled economics costs. Cost anomaly thresholds are derived from `ECON_TARGET_REVENUE_MULTIPLE`.
