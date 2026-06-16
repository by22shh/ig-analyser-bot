# Phase 5: Finance reconciliation

Дата: 2026-06-13 Asia/Novosibirsk

## What changed

Implemented a finance reconciliation export that compares payment money, credit ledger movement, outstanding credit liability, failed payment events and provider cost estimates in one report.

## Deliverables

- `src/modules/finance/reconciliation.ts`
- `scripts/finance/export-reconciliation.ts`
- `tests/unit/finance-reconciliation.test.ts`
- `docs/operations/finance-reconciliation.md`
- package script `finance:reconciliation`

## Coverage

| Area              | Evidence                                                                              |
| ----------------- | ------------------------------------------------------------------------------------- |
| Date range export | `--from`, `--to`, default trailing 7-day range                                        |
| Formats           | JSON, CSV and TSV via `--format`, `--json`, `--csv`, `--tsv`                          |
| Money             | Gross paid orders, successful refunds, net minor amounts by provider/currency         |
| Credit ledger     | Credits sold, consumed, reserved, released, refunded and adjusted                     |
| Liability         | Current balance/reserved/available units and net RUB exposure                         |
| Provider costs    | Actual `api_usage_events` costs plus modeled costs from economics settings            |
| Safety            | Raw payloads, user IDs and provider payment identifiers are redacted/omitted          |
| Anomalies         | Failed events, unmapped captures, negative liability and economics threshold overruns |

## Export sample

Sample artifact: `docs/audit/2026-06-12-fix-all-problems/commands/phase-5/export-sample.tsv`.

Excerpt:

```tsv
section	metric	scope	value
payments	gross_minor	yookassa:RUB	69000
credits	sold_units	all	300
credits	consumed_units	all	100
provider_costs	actual_usage_rub	all	38
provider_costs	modeled_usage_rub	all	55
```

## Runbook excerpt

`docs/operations/finance-reconciliation.md` requires weekly JSON + TSV exports, provider dashboard reconciliation, failed event triage, liability review and go/no-go thresholds derived from `ECON_TARGET_REVENUE_MULTIPLE`.

## Validation

Command logs are under `docs/audit/2026-06-12-fix-all-problems/commands/phase-5/`.

| Command                                                                                       | Exit | Log                            |
| --------------------------------------------------------------------------------------------- | ---: | ------------------------------ |
| `pnpm exec vitest run tests/unit/finance-reconciliation.test.ts tests/unit/economics.test.ts` |    0 | `vitest-finance-economics.log` |
| `pnpm exec tsx scripts/finance/export-reconciliation.ts --help`                               |    0 | `export-help.log`              |
| `pnpm typecheck`                                                                              |    0 | `typecheck.log`                |
| `pnpm lint`                                                                                   |    0 | `lint.log`                     |
