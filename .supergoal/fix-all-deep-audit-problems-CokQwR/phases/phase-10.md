SUPERGOAL_PHASE_START
Phase: 10 of 12 - Report Quality Telemetry
Task: Add repair-rate telemetry, low-evidence guards, raw-output cleanup and Fly parity checklist.
Type: brownfield, hardening, product-quality
Mandatory commands: pnpm exec vitest run tests/unit/report-builder.test.ts tests/unit/report-quality.test.ts tests/unit/content-quality.test.ts tests/unit/analysis-context.test.ts tests/unit/grounding.test.ts, pnpm eval-golden, pnpm typecheck, pnpm lint
Acceptance criteria: 5
Evidence required: golden eval summary, telemetry test summary, diff excerpt
Depends on phases: 2, 6, 9

## Why

The paid report is the core value. Repair attempts and low-evidence cases must be measurable and safe.

## Work

- Inspect analysis worker, report builder, quality gate, usage logging and report metadata.
- Record repair attempts/success/failure and failed-quality signals without exposing prompts or raw secrets.
- Add low-evidence fixtures/tests and safer summary/warning language.
- Ensure raw `[[SECTION]]` markers cannot reach user/admin surfaces.
- Add deploy then Fly eval checklist/script docs.

## Acceptance criteria

- [ ] Analysis pipeline records repair attempts, repair success/failure, failed_quality and low-evidence flags in usage/report telemetry without exposing prompts.
- [ ] Tests cover first-pass repair metrics and failed-quality metrics.
- [ ] Low-evidence/large-profile fixtures assert prominent warnings and safe confidence language.
- [ ] Raw `[[SECTION]]` markers cannot reach user-facing report/chat/admin export surfaces.
- [ ] Docs/script describe deploy then Fly live eval before making production quality claims.

## Mandatory commands

- `pnpm exec vitest run tests/unit/report-builder.test.ts tests/unit/report-quality.test.ts tests/unit/content-quality.test.ts tests/unit/analysis-context.test.ts tests/unit/grounding.test.ts`
- `pnpm eval-golden`
- `pnpm typecheck`
- `pnpm lint`

## Evidence required

- Golden eval summary.
- Metrics/test summary.
- Diff excerpt for telemetry fields.

## Dependencies

phases 2, 6, 9

