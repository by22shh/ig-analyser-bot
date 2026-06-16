# Phase 4: Recovery runbooks

Дата: 2026-06-13 Asia/Novosibirsk

## What changed

Added operational runbooks for paid-data recovery, migration rollback and queue/payment triage. Added a validator so the runbooks cannot silently lose required recovery sections or SQL snippets.

## Deliverables

- `docs/operations/backup-restore-pitr.md`
- `docs/operations/migration-rollback.md`
- `docs/operations/queue-payment-triage.md`
- `scripts/ops/validate-recovery-runbooks.ts`
- package script `validate:recovery-runbooks`

## Required coverage

| Area                 | Evidence                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Backup/restore/PITR  | RPO/RTO, owner, Neon PITR/export, restore drill cadence, validation SQL                     |
| Migration rollback   | Fly release rollback, Prisma migration checks, decision tree, stop conditions               |
| Queue/payment triage | SQL for stale leases, stuck jobs, failed jobs, pending payments, reserves, duplicate events |

## Validation

The validator checks file presence and required text/SQL markers. It exits non-zero if a required runbook section is removed.

Command logs are under `docs/audit/2026-06-12-fix-all-problems/commands/phase-4/`.

| Command                                                   | Exit | Log                              |
| --------------------------------------------------------- | ---: | -------------------------------- |
| `pnpm exec tsx scripts/ops/validate-recovery-runbooks.ts` |    0 | `validate-recovery-runbooks.log` |
| `pnpm typecheck`                                          |    0 | `typecheck.log`                  |
| `pnpm lint`                                               |    0 | `lint.log`                       |
| `pnpm validate:recovery-runbooks`                         |    0 | `package-script.log`             |
