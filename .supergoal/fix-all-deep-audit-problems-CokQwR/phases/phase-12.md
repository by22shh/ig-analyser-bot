SUPERGOAL_PHASE_START
Phase: 12 of 12 - Deployment Final Harden
Task: Final deployment protection, resolved-gap report and full verification.
Type: brownfield, hardening, product-quality, ops, security, ui
Mandatory commands: pnpm run ci, pnpm eval-golden, pnpm audit-economics:defaults, all new validation/smoke scripts added by earlier phases
Acceptance criteria: 6
Evidence required: final command summary, resolved issue ledger, final diff stat, secret/cleanliness scan
Depends on phases: 1 through 11

## Why

This phase proves all fixes compose and that any remaining work is honestly external, not hidden repo debt.

## Work

- Add deployment protection docs or workflow environment changes for production approval.
- Update `ISSUE-LEDGER.md` with fixed/mitigated/external-action-required status for every problem.
- Write `docs/audit/2026-06-12-fix-all-problems/FINAL-FIX-REPORT.md`.
- Run final aggregate commands and all new validation/smoke scripts.
- Review final diff and run secret/cleanliness scans.

## Acceptance criteria

- [ ] Deployment workflow either uses a protected environment/manual approval or documents the required GitHub environment protection that cannot be set from code.
- [ ] All P1/P2/P3 issues from `ISSUE-LEDGER.md` are marked fixed, mitigated with evidence, or explicitly external-action-required.
- [ ] Full `pnpm run ci` passes.
- [ ] `pnpm eval-golden`, `pnpm audit-economics:defaults`, runbook validation, alert validation, and smoke dry-run all pass.
- [ ] Final diff review finds no stray debug output, session TODO/FIXME, real secrets, unrelated reverts or temporary files.
- [ ] Final report distinguishes local repo readiness from Fly production readiness and states exactly what external operator steps remain.

## Mandatory commands

- `pnpm run ci`
- `pnpm eval-golden`
- `pnpm audit-economics:defaults`
- all new validation/smoke scripts added by earlier phases

## Evidence required

- Final command summary.
- Resolved issue ledger summary.
- Final `git diff --stat`.
- Secret/cleanliness scan summary.

## Dependencies

phases 1 through 11

