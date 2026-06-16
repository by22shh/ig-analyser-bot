SUPERGOAL_PHASE_START
Phase: 8 of 8 - Polish & Harden
Task: Recheck all audit evidence, apply final low-risk fixes, run full CI, and publish verdict.
Type: brownfield, audit, hardening, product-quality
Mandatory commands: pnpm run ci, pnpm eval-golden, pnpm audit-economics:defaults
Acceptance criteria: 7
Evidence required: final CI summaries, final verdict excerpt, artifact listing, final diff stat
Depends on phases: 1, 2, 3, 4, 5, 6, 7

## Why

The final phase rechecks everything together and turns the audit into a clear product verdict.

## Work

- Write `docs/audit/2026-06-12-deep-product-audit/FINAL-AUDIT.md`.
- Write `docs/audit/2026-06-12-deep-product-audit/BEST-IN-CLASS-GAP-ANALYSIS.md`.
- Re-read every prior audit report and reconcile unresolved P0/P1 findings.
- Apply final low-risk fixes only when deterministic, small, and covered by tests.
- Run the full final mandatory commands and summarize output.
- Review final diff for accidental debug output, temporary files, secrets, TODO/FIXME added by this run, and unrelated churn.

## Acceptance criteria (all must pass - verify each in transcript)

- All prior audit reports exist and their P0/P1 findings are either fixed, downgraded with evidence, or listed as launch blockers.
- The final report gives explicit answers for: "Is everything good?", "Are there errors?", "Is everything thought through?", and "Can this be called the best product?"
- The final report separates local repository readiness from currently deployed Fly production readiness.
- Full CI-equivalent command succeeds, or every failure is classified with exact cause and blocking status.
- Final `git diff --stat` is reviewed for accidental debug output, temporary files, prompt leaks, TODO/FIXME added by this run, and unrelated churn.
- `BEST-IN-CLASS-GAP-ANALYSIS.md` contains a ranked gap list with severity, user impact, business impact, fix size, and recommended next action.
- No audit artifact prints secrets or private credential values.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm run ci`
- `pnpm eval-golden`
- `pnpm audit-economics:defaults`

## Evidence required in transcript

- Final CI/eval/economics summaries.
- Final verdict excerpt.
- Final audit artifact listing.
- Final `git diff --stat` summary.

## Notes

The verdict must be honest. If the product is very good but not best-in-class, say that and list the exact blockers.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/deep-product-audit-MxrP9V/PROTOCOL.md without further
instruction needed here.

