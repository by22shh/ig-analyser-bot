SUPERGOAL_PHASE_START
Phase: 2 of 8 - Review Architecture
Task: Audit architecture, data model, queues, transactions, and invariants.
Type: brownfield, audit, hardening, product-quality
Mandatory commands: DATABASE_URL=postgresql://ig_analyser:ig_analyser@localhost:5432/ig_analyser_bot DIRECT_URL=postgresql://ig_analyser:ig_analyser@localhost:5432/ig_analyser_bot pnpm exec prisma validate, pnpm exec vitest run tests/unit/retry.test.ts tests/unit/postgres-workers.test.ts tests/unit/worker-lease-guard.test.ts tests/unit/credits-release.test.ts tests/unit/user-service-race.test.ts tests/integration/credits.service.test.ts, pnpm typecheck, pnpm lint
Acceptance criteria: 6
Evidence required: architecture risk table, targeted test summary, patch summary if fixes applied
Depends on phases: 1

## Why

A product cannot be "best" if its data model, queues, transactions, and module boundaries are brittle.

## Work

- Write `docs/audit/2026-06-12-deep-product-audit/01-architecture-data-invariants.md`.
- Map module boundaries and major call paths from Telegram/Mini App entry points through jobs, analysis, reports, payments, and providers.
- Review Prisma schema, migrations, referential actions, unique keys, indexes, retention fields, and migration drift risk.
- Review queue drivers, leases, retries, worker shutdown, duplicate-work prevention, and recovery paths.
- Review credit ledger/payment transaction boundaries for reserve/capture/release correctness.
- Apply small tests/fixes only when a deterministic P0/P1 invariant defect is found.

## Acceptance criteria (all must pass - verify each in transcript)

- The report maps key modules: Telegram handlers, Mini App routes, analysis pipeline, LLM adapter, payments, credits, jobs, reports, storage, and provider adapters.
- Prisma schema and migrations are checked for referential integrity, cascade behavior, idempotency keys, indexes, retention fields, and drift risk.
- Queue behavior has a pass/fail/skipped table for lease safety, retry semantics, duplicate work prevention, and worker shutdown behavior, with file references or test evidence for each row.
- Credit ledger and payment transaction boundaries are checked for reserve/capture/release correctness.
- Environment validation and production assertions are checked against deployment expectations.
- Any discovered P0/P1 invariant defect is either fixed with a focused test or documented with exact file/line evidence and impact.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `DATABASE_URL=postgresql://ig_analyser:ig_analyser@localhost:5432/ig_analyser_bot DIRECT_URL=postgresql://ig_analyser:ig_analyser@localhost:5432/ig_analyser_bot pnpm exec prisma validate`
- `pnpm exec vitest run tests/unit/retry.test.ts tests/unit/postgres-workers.test.ts tests/unit/worker-lease-guard.test.ts tests/unit/credits-release.test.ts tests/unit/user-service-race.test.ts tests/integration/credits.service.test.ts`
- `pnpm typecheck`
- `pnpm lint`

## Evidence required in transcript

- Architecture risk table with severity and affected files.
- Targeted test output summary.
- Any patch summary for low-risk fixes.

## Notes

Do not perform broad refactors during an audit phase. Record non-blocking architecture improvements in the report.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/deep-product-audit-MxrP9V/PROTOCOL.md without further
instruction needed here.
