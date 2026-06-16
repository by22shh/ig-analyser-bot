# Phase 2: Economics truth

Дата: 2026-06-13 Asia/Novosibirsk  
Статус: support-reserve launch blocker fixed in repository code, tests and docs.

## What changed

`ECON_STANDARD_REPORT_COST_P75_RUB` now means provider/report p75 cost before support reserve. `audit-economics` adds `ECON_SUPPORT_RESERVE_RUB` explicitly to Standard, photo search, and modes derived from Standard. This keeps support reserve visible as a separate modeled cost instead of silently relying on it being included in the p75 provider estimate.

The safe default scenario changed from `55 + 5` to `50 + 5`:

- Standard provider/report p75: `50 RUB`
- Support reserve: `5 RUB`
- Fully loaded Standard cost in audit output: `55 RUB`

## Files touched

- `src/modules/economics/model.ts`
- `tests/unit/economics.test.ts`
- `package.json`
- `.github/workflows/ci.yml`
- `.env.example`
- `docs/financial-model.md`
- `docs/development/local-run.md`
- `docs/deployment/fly-neon.md`

## Command summary

Logs: `docs/audit/2026-06-12-fix-all-problems/commands/phase-2/`

| #   | Command                                                                                           |       Exit | Result                                                                                     |
| --- | ------------------------------------------------------------------------------------------------- | ---------: | ------------------------------------------------------------------------------------------ |
| 1   | `pnpm exec vitest run tests/unit/economics.test.ts tests/unit/payment-package-visibility.test.ts` |          0 | 2 files passed, 8 tests passed                                                             |
| 2   | `pnpm audit-economics:defaults`                                                                   |          0 | Standard cost `55.00`, required `100`, multiple `3.01x`; chat `4.14x`; influencer `5.24x`  |
| 3   | `pnpm typecheck`                                                                                  |          0 | TypeScript check passed                                                                    |
| 4   | `pnpm lint`                                                                                       |          0 | ESLint passed                                                                              |
| 5   | old `55 + support 5` scenario                                                                     | 1 expected | Standard cost `60.00`, required `109`, multiple `2.76x`; economics audit fails as intended |

## Semantics now enforced

| Input scenario                | Fully loaded Standard cost | Required units | Charged units | Multiple | Status        |
| ----------------------------- | -------------------------: | -------------: | ------------: | -------: | ------------- |
| `50 provider + 5 support`     |                    `55.00` |          `100` |         `100` |  `3.01x` | pass          |
| old `55 provider + 5 support` |                    `60.00` |          `109` |         `100` |  `2.76x` | expected fail |

## Test coverage

`tests/unit/economics.test.ts` now covers:

- Stars and YooKassa revenue floors with support reserve counted.
- Additive support reserve increasing Standard from `55` to `60`.
- Required-unit math for the underpriced Standard scenario.
- Support reserve inclusion in photo-search cost modeling.

## Remaining notes

The audit output column still says `cost RUB`; it now represents fully loaded modeled mode cost, not provider-only cost. Phase 5 finance reconciliation and Phase 6 alerting should use this fully loaded value for margin/cost anomaly calculations.
