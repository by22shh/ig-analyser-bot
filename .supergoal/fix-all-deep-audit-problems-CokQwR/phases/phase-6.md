SUPERGOAL_PHASE_START
Phase: 6 of 12 - Alerts Observability
Task: Add alert thresholds, routing, validation and docs for production operations.
Type: brownfield, hardening, ops
Mandatory commands: pnpm exec tsx scripts/ops/validate-alerts.ts, pnpm typecheck, pnpm lint
Acceptance criteria: 5
Evidence required: alert config excerpt, validation output, package/workflow diff
Depends on phases: 2, 3, 5

## Why

Provider errors, queue backlog, payment failures and cost spikes should be visible before users report them.

## Work

- Add structured alert config under `config/alerts/`.
- Add `scripts/ops/validate-alerts.ts`.
- Add `docs/operations/alerts-routing.md`.
- Wire validation into package scripts and, if appropriate, CI.
- Cover provider, payment, queue, report, retention, S3/PDF, repair-rate and cost anomaly signals.

## Acceptance criteria

- [ ] Alert config defines thresholds, severity, owner/routing, runbook link, and signal source for every required signal.
- [ ] Validation script fails when any required alert lacks threshold, owner or runbook link.
- [ ] Observability docs explain Sentry/OTEL/log-based implementation and local/staging smoke.
- [ ] CI or `pnpm run ci` invokes alert validation directly or through a new audit script.
- [ ] No alert examples contain real secrets or production tokens.

## Mandatory commands

- `pnpm exec tsx scripts/ops/validate-alerts.ts`
- `pnpm typecheck`
- `pnpm lint`

## Evidence required

- Alert config excerpt.
- Validation output.
- Package/workflow diff summary.

## Dependencies

phases 2, 3, 5

