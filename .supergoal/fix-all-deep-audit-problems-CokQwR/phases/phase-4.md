SUPERGOAL_PHASE_START
Phase: 4 of 12 - Recovery Runbooks
Task: Add executable recovery runbooks and validation for backup, restore, rollback, queue and payment triage.
Type: brownfield, hardening, ops
Mandatory commands: pnpm exec tsx scripts/ops/validate-recovery-runbooks.ts, pnpm typecheck, pnpm lint
Acceptance criteria: 5
Evidence required: runbook listing, validation output, SQL snippets excerpt
Depends on phases: 1, 2, 3

## Why

Paid credit/payment state requires tested operator recovery paths. This phase turns missing runbooks into concrete repo artifacts.

## Work

- Add `docs/operations/backup-restore-pitr.md`.
- Add `docs/operations/migration-rollback.md`.
- Add `docs/operations/queue-payment-triage.md`.
- Add `scripts/ops/validate-recovery-runbooks.ts` and a package script.
- Include SQL snippets and clear stop conditions.

## Acceptance criteria

- [ ] Backup/restore/PITR runbook includes RPO/RTO, owner, Neon export/PITR steps, restore drill cadence, and validation SQL.
- [ ] Migration rollback runbook covers Fly release rollback, DB migration rollback decision tree, and stop conditions.
- [ ] Queue/payment triage doc includes SQL snippets for stale leases, stuck jobs, failed jobs, pending payments, reserves, and duplicate events.
- [ ] Validation script checks required sections/snippets and exits non-zero when content is missing.
- [ ] Package scripts expose the runbook validation.

## Mandatory commands

- `pnpm exec tsx scripts/ops/validate-recovery-runbooks.ts`
- `pnpm typecheck`
- `pnpm lint`

## Evidence required

- `ls` of operation docs and script.
- Validation output.
- Key SQL snippets excerpt.

## Dependencies

phases 1, 2, 3

