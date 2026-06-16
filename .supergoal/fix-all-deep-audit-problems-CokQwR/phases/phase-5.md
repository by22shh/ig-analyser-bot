SUPERGOAL_PHASE_START
Phase: 5 of 12 - Finance Reconciliation
Task: Implement finance reconciliation export and cost/liability checks.
Type: brownfield, hardening, ops
Mandatory commands: pnpm exec vitest run tests/unit/finance-reconciliation.test.ts tests/unit/economics.test.ts, pnpm exec tsx scripts/finance/export-reconciliation.ts --help, pnpm typecheck, pnpm lint
Acceptance criteria: 5
Evidence required: export sample, test summary, runbook excerpt
Depends on phases: 2, 3

## Why

The audit found no implementation for weekly finance dashboard/export despite financial-model docs requiring it.

## Work

- Inspect Prisma payment/credit/user/report schemas and payment service.
- Implement `scripts/finance/export-reconciliation.ts` with JSON and CSV/TSV modes.
- Add pure aggregation helpers if needed so tests do not require live DB for every case.
- Add `docs/operations/finance-reconciliation.md`.
- Update package scripts if helpful.

## Acceptance criteria

- [ ] Export script supports date range, JSON and CSV/TSV output, and safe redaction of user/payment raw payloads.
- [ ] Export includes gross payments, provider channel, refunds, credits sold, credits consumed, outstanding liability, failed events, and provider cost estimates.
- [ ] Tests cover aggregation, redaction, empty range, refunds, and provider-cost estimation.
- [ ] Finance runbook explains weekly reconciliation and launch go/no-go checks.
- [ ] Cost anomaly thresholds are derived from economics model or documented configuration.

## Mandatory commands

- `pnpm exec vitest run tests/unit/finance-reconciliation.test.ts tests/unit/economics.test.ts`
- `pnpm exec tsx scripts/finance/export-reconciliation.ts --help`
- `pnpm typecheck`
- `pnpm lint`

## Evidence required

- Export `--help` output.
- Test summary.
- Runbook excerpt.

## Dependencies

phases 2, 3

