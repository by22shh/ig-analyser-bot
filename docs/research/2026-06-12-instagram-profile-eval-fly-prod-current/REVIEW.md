# Fly Production Instagram Profile Eval

Date: 2026-06-12

Run path: Fly app `ig-analyser-bot`, machine `28707d0c396408`, temporary output `/tmp/ig-profile-eval-final-live`.

Profiles: `evachkaaaaa`, `missstaccyy`, `_daria.bers_`, `fakeev`, `mark.tales`.

Scope: real Fly runtime env and deployed secrets (`APIFY_TOKEN`, `OPENROUTER_API_KEY`), Apify `apify~instagram-scraper` ingestion, deployed `dist` pipeline, OpenRouter vision/reasoning, report repair and quality scoring.

## Verdict

The deployed production algorithm works end-to-end: all 5 public profiles completed, all 5 reports produced the required 17 sections, all 142 selected posts were ingested, and 141/142 selected visual items completed.

The deployed version is useful, but not yet the best current version of the codebase. The Fly deployment does not include the local final delivery gate (`deliveryHealth` is absent), and one report still shipped with a missing-source section. The local worktree has fixes for this and passed tests/build/lint.

## Fly Run Summary

| Profile | Coverage | Vision | Sources | Quality | Content | Main warning |
|---|---:|---:|---:|---:|---:|---|
| `evachkaaaaa` | 30/141 | 30/30 completed | 16/17 | 86 | 99 | `Профессия и статус` has no source |
| `missstaccyy` | 22/23 | 22/22 completed | 17/17 | 100 | 97 | none |
| `_daria.bers_` | 30/118 | 30/30 completed | 17/17 | 100 | 100 | none |
| `fakeev` | 30/1087 | 30/30 completed | 17/17 | 93 | 87 | very low sample coverage, weak practical detail |
| `mark.tales` | 30/94 | 29/30 completed, 1 skipped | 17/17 | 93 | 88 | partial vision, weak practical detail |

Aggregate: 5/5 completed, 85/85 required sections present, 84/85 sections sourced, 141/142 vision items completed.

## Findings

1. Production ingestion and LLM calls are healthy.

   Apify and OpenRouter worked from Fly with deployed secrets. No profile failed, and profile data matched expected public scale: `fakeev` had 1087 total posts, while `missstaccyy` had near-full coverage at 22/23 fetched posts.

2. Report structure is reliable.

   Every report had 17 parsed sections and 10-12k raw characters, so the previous truncation/empty-report risk did not reproduce.

3. Deployed QA is weaker than local QA.

   The deployed `dist` report objects do not include `summary.deliveryHealth`. This means the current production bot can still return a report that has quality warnings or missing sources without a hard final ship/no-ship status.

4. One source gap survives in production.

   `evachkaaaaa` section `Профессия и статус` had no extracted source. The prose is cautious and probably acceptable to read, but formal evidence coverage is incomplete. The local worktree fixes this with source fallback and a final delivery gate.

5. The biggest remaining content limitation is practical depth on edge cases.

   `fakeev` and `mark.tales` both passed structure/source checks but still had `content:weak_practical_detail` for practical sections. The reports are safe, but they can be sharper and more useful for paid users.

6. User-facing instruction leaks were not found in the fresh Fly raw reports.

   Raw report grep found no `70+`, `3+ phrases`, `evidence-tied`, `respectful next`, `analysisContext`, `profileSignals`, `contentClusters`, `sourceCatalog`, `postIds`, `SHIP_GATE`, or `TARGETED_REPAIR` strings in user-facing `.raw.txt`.

## Comparison To Local Worktree

The local after-gate rerun in `docs/research/2026-06-12-instagram-profile-eval-prod-apify-after-gate-rerun` is better than the currently deployed Fly code:

- source coverage improved from the deployed 84/85 to 85/85;
- `deliveryHealth.status=ready` exists for all 5 reports;
- missing-source sections are repaired or backed by a profile-level public source;
- schema/instruction leaks are cleaned in final user-facing text.

Local verification passed:

- `pnpm exec vitest run tests/unit/report-builder.test.ts tests/unit/practical-requirements.test.ts tests/unit/report-quality.test.ts tests/unit/structured-output.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
- `pnpm test`
- `pnpm build`
- `pnpm lint`

## Product Conclusion

Production is functional and useful for beta users, but I would not call the currently deployed algorithm fully production-grade QA yet because it lacks the final delivery gate and can ship one unsourced section.

The current local codebase is much closer to production-grade: it adds delivery gating, source fallback, targeted repair, low-evidence templates, and output cleanup. The next action should be to deploy the current local gate/fallback changes, then rerun the same five-profile Fly eval and require 5/5 reports to have `deliveryHealth.status=ready` and 85/85 sourced sections.
