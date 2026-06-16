SUPERGOAL_PHASE_START
Phase: 1 of 8 - Establish Baseline
Task: Establish trustworthy audit baseline and command health.
Type: brownfield, audit, hardening, product-quality
Mandatory commands: pnpm prisma:generate, pnpm audit:prod, pnpm lint, pnpm format:check, pnpm typecheck, pnpm build, pnpm test, pnpm audit-economics:defaults
Acceptance criteria: 6
Evidence required: command summary table, git status excerpt, diff stat, baseline report path
Depends on phases: none

## Why

The audit needs a trustworthy baseline before classifying defects or claiming product quality.

## Work

- Create `docs/audit/2026-06-12-deep-product-audit/` and `commands/`.
- Capture repository identity, current branch, HEAD SHA, dirty/untracked files, package scripts, Node/pnpm versions, and provider-mode assumptions.
- Run the mandatory commands and save concise output logs under `commands/`.
- Summarize command exits, dependency audit result, and local-vs-production context in `00-baseline.md`.
- Treat existing modified files as user-owned baseline work; do not revert unrelated changes.

## Acceptance criteria (all must pass - verify each in transcript)

- `docs/audit/2026-06-12-deep-product-audit/00-baseline.md` exists and includes HEAD SHA, branch, dirty/untracked files, Node version, pnpm version, package scripts, and provider mode assumptions.
- Every mandatory command is run once, with exit code and last relevant output saved under `commands/` and summarized in `00-baseline.md`.
- Any failing command is classified as pre-existing, environment-only, or introduced-by-audit with evidence.
- `pnpm audit:prod` result is included with severity summary.
- Current local worktree changes are explicitly listed as user-owned baseline changes and are not reverted.
- The baseline report distinguishes local code state from current Fly production state using existing eval docs when present.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm prisma:generate`
- `pnpm audit:prod`
- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`
- `pnpm audit-economics:defaults`

## Evidence required in transcript

- Command summary table with exit codes.
- `git status --short` and `git diff --stat` excerpts.
- Baseline report path and file size.

## Notes

No source fixes are required in this phase unless a command failure is caused by a trivial, deterministic issue introduced during this phase.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/deep-product-audit-MxrP9V/PROTOCOL.md without further
instruction needed here.

