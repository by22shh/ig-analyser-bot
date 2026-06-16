SUPERGOAL_PHASE_START
Phase: 9 of 12 - Privacy Admin Hardening
Task: Add OSINT auditability, admin regression tests, full delete-me contract, CSP and Docker hardening.
Type: brownfield, hardening, security
Mandatory commands: pnpm exec vitest run tests/unit/admin.test.ts tests/unit/consent-gate.test.ts tests/unit/mini-app-auth.test.ts tests/integration/users.service.test.ts tests/unit/usage-safe.test.ts, pnpm build, pnpm typecheck, pnpm lint
Acceptance criteria: 5
Evidence required: security test output, CSP/Docker diff, audit-trail field excerpt
Depends on phases: 3, 8

## Why

Existing security gates are strong, but powerful operations need durable audit trails and regression tests.

## Work

- Implement durable OSINT lawful-basis audit metadata.
- Add dedicated admin grant/refund tests.
- Expand delete-me contract tests with fake storage/payment/report artifacts.
- Harden Mini App CSP where feasible.
- Update Dockerfile to run as non-root without breaking Playwright/PDF.

## Acceptance criteria

- [ ] Starting `osint_compliance` writes durable audit metadata: userId, report/job id where available, mode, source, requestId, timestamp, lawfulBasisVersion.
- [ ] Admin grant/refund tests cover non-admin no-op, invalid inputs, max grant cap, auditLog success/failure, refund idempotency.
- [ ] Delete-me test covers fake storage, report artifacts, payment rows, raw/payload fields, user PII and credit balances.
- [ ] Mini App CSP removes or narrows `unsafe-inline` where feasible and restricts `img-src` to necessary domains.
- [ ] Docker runtime uses a non-root user while preserving Playwright/PDF functionality.

## Mandatory commands

- `pnpm exec vitest run tests/unit/admin.test.ts tests/unit/consent-gate.test.ts tests/unit/mini-app-auth.test.ts tests/integration/users.service.test.ts tests/unit/usage-safe.test.ts`
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`

## Evidence required

- Security test output.
- CSP/Docker diff summary.
- Audit-trail field excerpt.

## Dependencies

phases 3, 8

