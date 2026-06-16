SUPERGOAL_PHASE_START
Phase: 1 of 12 - Safety Net Baseline
Task: Capture current state and convert the audit findings into a verifiable issue ledger.
Type: brownfield, hardening, product-quality, ops, security, ui
Mandatory commands: pnpm run ci, pnpm eval-golden, pnpm exec prisma validate
Acceptance criteria: 5
Evidence required: command summaries, issue ledger excerpt, git status/diff excerpts
Depends on phases: none

## Why

Large hardening work needs a stable baseline. This phase must not change product behavior except creating audit/planning artifacts.

## Work

- Create `docs/audit/2026-06-12-fix-all-problems/`.
- Write `00-fix-baseline.md` with repo identity, dirty tree, command results, tool versions and previous audit artifact links.
- Write `ISSUE-LEDGER.md` mapping every P1/P2/P3 problem to a phase and verification method.
- Create command logs under `docs/audit/2026-06-12-fix-all-problems/commands/phase-1/`.
- Explicitly classify repo-fixable vs external-action-required issues.

## Acceptance criteria

- [ ] Baseline report records HEAD, branch, dirty/untracked files, package scripts, tool versions, and previous audit artifact paths.
- [ ] Issue ledger maps every P1/P2/P3 problem from the audit to a planned phase and expected verification method.
- [ ] Existing tests and commands are run once and all failures are classified before code changes.
- [ ] No user-owned pre-existing changes are reverted.
- [ ] The ledger explicitly separates repo-fixable work from external operator actions.

## Mandatory commands

- `pnpm run ci`
- `pnpm eval-golden`
- `pnpm exec prisma validate`

## Evidence required

- Command summary table with exit codes and log paths.
- Issue ledger excerpt covering at least all P1 entries.
- `git status --short` and `git diff --stat` excerpts.

## Dependencies

none

