SUPERGOAL_PHASE_START
Phase: 4 of 8 - Audit Analysis Quality
Task: Audit LLM report quality, evidence coverage, delivery gate, and evals.
Type: brownfield, audit, hardening, product-quality
Mandatory commands: pnpm eval-golden, pnpm exec vitest run tests/unit/report-builder.test.ts tests/unit/report-quality.test.ts tests/unit/content-quality.test.ts tests/unit/analysis-context.test.ts tests/unit/structured-output.test.ts tests/unit/grounding.test.ts tests/unit/openrouter-empty.test.ts tests/unit/practical-requirements.test.ts, pnpm typecheck, pnpm lint
Acceptance criteria: 6
Evidence required: golden eval summary, metrics JSON path, prompt-leak grep summary, fix evidence if applied
Depends on phases: 1, 2

## Why

The analysis report is the core paid value; structure, grounding, source coverage, and practical usefulness must be tested directly.

## Work

- Write `docs/audit/2026-06-12-deep-product-audit/03-analysis-quality.md`.
- Write metrics to `docs/audit/2026-06-12-deep-product-audit/analysis-quality-metrics.json`.
- Run golden eval and targeted quality tests.
- Compare current local behavior to existing eval artifacts under `docs/research/`, especially local vs Fly production divergence.
- Scan user-facing report text for internal rubric, schema, prompt, repair, and gate leaks.
- Apply small deterministic quality fixes with focused tests when evidence is strong.

## Acceptance criteria (all must pass - verify each in transcript)

- The report checks required section coverage, parsed section count, source coverage, `deliveryHealth`, practical detail, low-evidence behavior, and prompt/instruction leak resistance.
- Existing eval artifacts under `docs/research/` are compared against current local behavior, including local vs Fly production divergence.
- Golden eval output is saved and summarized with pass/fail metrics.
- User-facing report text is scanned for internal rubric, schema, prompt, and repair/gate leakage.
- Structured output fallback and parse failure behavior are verified through tests.
- Any deterministic report-quality bug is fixed with a focused unit test; any subjective quality gap is recorded as a prioritized product gap.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm eval-golden`
- `pnpm exec vitest run tests/unit/report-builder.test.ts tests/unit/report-quality.test.ts tests/unit/content-quality.test.ts tests/unit/analysis-context.test.ts tests/unit/structured-output.test.ts tests/unit/grounding.test.ts tests/unit/openrouter-empty.test.ts tests/unit/practical-requirements.test.ts`
- `pnpm typecheck`
- `pnpm lint`

## Evidence required in transcript

- Golden eval summary.
- Metrics JSON path and key metrics.
- Prompt-leak grep summary.
- Before/after evidence for any quality fix.

## Notes

If live OpenRouter/Apify secrets are unavailable, use golden/mock/local artifacts and clearly mark live provider checks as skipped.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/deep-product-audit-MxrP9V/PROTOCOL.md without further
instruction needed here.

