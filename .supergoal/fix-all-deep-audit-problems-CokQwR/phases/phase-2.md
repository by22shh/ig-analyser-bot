SUPERGOAL_PHASE_START
Phase: 2 of 12 - Economics Truth
Task: Fix support reserve semantics in economics model, tests, defaults and docs.
Type: brownfield, hardening, product-quality, ops
Mandatory commands: pnpm exec vitest run tests/unit/economics.test.ts tests/unit/payment-package-visibility.test.ts, pnpm audit-economics:defaults, pnpm typecheck, pnpm lint
Acceptance criteria: 5
Evidence required: economics output, test summary, diff summary
Depends on phases: 1

## Why

The audit found a launch blocker: `ECON_SUPPORT_RESERVE_RUB` is required/documented but not counted by `audit-economics`.

## Work

- Inspect `src/modules/economics/*`, `scripts/audit-economics.ts`, `package.json`, `src/config/env.ts`, `.env.example`, and `docs/financial-model.md`.
- Decide and implement explicit semantics. Prefer additive support reserve unless code/docs clearly prove it is already included.
- Update defaults/pricing or required-unit calculations so guardrails pass honestly.
- Add or update tests for required-unit math and support reserve behavior.
- Document whether Standard report cost is provider-only or fully loaded.

## Acceptance criteria

- [ ] `ECON_SUPPORT_RESERVE_RUB` semantics are unambiguous in code, env docs and financial docs.
- [ ] `audit-economics` includes support reserve in Standard report economics when support is additive.
- [ ] Default pricing/env values are updated so `pnpm audit-economics:defaults` passes with honest support-reserve math.
- [ ] Unit tests cover additive support reserve, any retained included-support mode, and required-units math.
- [ ] Phase report shows Standard, chat and influencer margins after the fix.

## Mandatory commands

- `pnpm exec vitest run tests/unit/economics.test.ts tests/unit/payment-package-visibility.test.ts`
- `pnpm audit-economics:defaults`
- `pnpm typecheck`
- `pnpm lint`

## Evidence required

- Last output lines for economics audit.
- Test summary.
- Diff summary for economics files and docs.

## Dependencies

phase 1

