SUPERGOAL_PHASE_START
Phase: 7 of 8 - Audit Economics Ops
Task: Audit pricing, cost guardrails, deployment, CI, observability, and runbooks.
Type: brownfield, audit, hardening, product-quality
Mandatory commands: pnpm audit-economics:defaults, pnpm exec vitest run tests/unit/economics.test.ts tests/unit/payment-package-visibility.test.ts tests/unit/background-leader.test.ts tests/unit/job-recovery.test.ts tests/unit/retention.service.test.ts, pnpm build, pnpm typecheck, pnpm lint
Acceptance criteria: 6
Evidence required: economics summary, ops checklist, launch-blocker table
Depends on phases: 1, 2, 5, 6

## Why

A best product must be economically viable and operable after deploy, not merely correct locally.

## Work

- Write `docs/audit/2026-06-12-deep-product-audit/06-economics-ops.md`.
- Review pricing packages, public package visibility, cost assumptions, provider reserves, and support reserve.
- Review Fly config, Dockerfile, GitHub Actions CI, release command, process groups, migration drift checks, and env requirements.
- Review observability and runbook gaps for jobs, payments, reports, provider outages, backups, and retention.
- Apply focused operational fixes only when deterministic and low-risk.

## Acceptance criteria (all must pass - verify each in transcript)

- Pricing packages, public package visibility, provider cost assumptions, Stars/YooKassa reserves, support reserve, and report/chat/photo-search margins are checked.
- `pnpm audit-economics:defaults` passes or produces a documented economics blocker.
- Fly config, Dockerfile, CI workflow, release command, process groups, env requirements, and migration drift strategy have pass/fail/skipped rows with file references.
- Observability coverage has pass/fail/skipped rows for structured logs, Sentry, OpenTelemetry, usage events, payment/job/report audit logs, and alerting gaps.
- Backup/restore, migration rollback, queue recovery, failed job recovery, stuck payment recovery, and provider outage runbooks are assessed.
- The report lists launch blockers separately from later improvements.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm audit-economics:defaults`
- `pnpm exec vitest run tests/unit/economics.test.ts tests/unit/payment-package-visibility.test.ts tests/unit/background-leader.test.ts tests/unit/job-recovery.test.ts tests/unit/retention.service.test.ts`
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`

## Evidence required in transcript

- Economics output summary.
- Ops readiness checklist.
- Launch-blocker table.

## Notes

Keep "best-in-class" claims grounded in measurable readiness: margins, failure recovery, observability, and deploy safety.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/deep-product-audit-MxrP9V/PROTOCOL.md without further
instruction needed here.
