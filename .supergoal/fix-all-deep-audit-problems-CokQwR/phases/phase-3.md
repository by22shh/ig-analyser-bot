SUPERGOAL_PHASE_START
Phase: 3 of 12 - CI Database Proof
Task: Make PostgreSQL-backed integration proof explicit and mandatory.
Type: brownfield, hardening, product-quality, ops
Mandatory commands: pnpm exec vitest run tests/integration/credits.service.test.ts tests/integration/users.service.test.ts, pnpm exec prisma validate, pnpm typecheck, pnpm lint
Acceptance criteria: 5
Evidence required: workflow diff, integration output or skip classification, local run docs
Depends on phases: 1, 2

## Why

Credit/payment invariants should not rely only on unit tests. CI already has services, but the audit asked for explicit proof and visibility.

## Work

- Inspect `.github/workflows`, `tests/integration`, `docker-compose.yml`, and package scripts.
- Add a dedicated integration DB script if useful, such as `test:integration:db`.
- Ensure CI runs DB integration tests as a hard gate with PostgreSQL service ready.
- Keep migration drift check present and visible.
- Add docs for local DB integration execution.

## Acceptance criteria

- [ ] Integration DB tests for credits/users/payment invariants are mandatory in CI and not hidden behind skipped suites.
- [ ] CI prints an explicit integration-test summary.
- [ ] Migration drift check remains present and documented.
- [ ] Local command docs explain how to run the same DB tests with `docker-compose`.
- [ ] Local unavailable-DB skips, if any, are classified and do not weaken CI gate.

## Mandatory commands

- `pnpm exec vitest run tests/integration/credits.service.test.ts tests/integration/users.service.test.ts`
- `pnpm exec prisma validate`
- `pnpm typecheck`
- `pnpm lint`

## Evidence required

- Workflow/package script diff excerpt.
- Integration command output or exact skip classification.
- Local run instructions path.

## Dependencies

phases 1, 2

