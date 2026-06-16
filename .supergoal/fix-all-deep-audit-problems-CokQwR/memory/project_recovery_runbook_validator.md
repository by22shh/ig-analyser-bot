# Project Memory: Recovery Runbook Validator

The project now has a scriptable recovery runbook gate:

- `scripts/ops/validate-recovery-runbooks.ts`
- package script `validate:recovery-runbooks`
- runbooks under `docs/operations/` for PITR/restore, migration rollback and queue/payment triage

When future operational docs change, run `pnpm validate:recovery-runbooks` together with typecheck/lint so required RPO/RTO, rollback, triage and SQL markers are not accidentally removed.
