# Instagram Profile Analysis Algorithm Review

Date: 2026-06-12

Run path: `docs/research/2026-06-12-instagram-profile-eval-prod-apify-codex-rerun`

Profiles: `evachkaaaaa`, `missstaccyy`, `_daria.bers_`, `fakeev`, `mark.tales`.

Scope: production-like live run using Fly runtime `APIFY_TOKEN` and `OPENROUTER_API_KEY`, Apify `apify~instagram-scraper` ingestion, local `buildStrategicReport` pipeline, OpenRouter vision/reasoning, grounding, repair, and report/content quality scoring. Secrets were loaded through a temporary local env file and removed after launch; values were not printed.

## Verdict

The algorithm works end-to-end and is useful enough for beta users, but it is not yet consistently production-polished.

Technically, the pipeline is healthy: all 5 public profiles completed, all reports had the required 17 sections, Apify returned rich post/media/comment data, and vision completed for 141/142 selected posts. The old user-facing leak problem (`70+ words`, `evidence-tied`, `respectful next steps`) did not reproduce in this fresh run.

The main remaining issue is final report quality consistency. Two reports (`evachkaaaaa`, `_daria.bers_`) shipped with missing-source or generic sections after repair, and three reports still had practical sections that were useful but not deep enough. The QA layer now detects these problems more honestly, but the repair loop does not always fix them before final return.

## Run Summary

| Profile | Coverage | Vision | Sources | Quality | Content | Main warning |
|---|---:|---:|---:|---:|---:|---|
| `evachkaaaaa` | 30/141 (21.3%) | 30/30 | 14/17 | 65 | 84 | 3 sections without sources |
| `missstaccyy` | 22/23 (95.7%) | 22/22 | 17/17 | 100 | 84 | weak practical detail |
| `_daria.bers_` | 30/118 (25.4%) | 30/30 | 15/17 | 61 | 78 | 2 sections without sources + schema-term leak |
| `fakeev` | 30/1087 (2.8%) | 29/30 | 17/17 | 86 | 97 | very low sample coverage |
| `mark.tales` | 30/94 (31.9%) | 30/30 | 17/17 | 100 | 96 | none |

Aggregate: 142 selected posts from 1,463 public posts (9.7% aggregate coverage), 85/85 required sections generated, 80/85 sections with extracted sources, 141/142 vision items completed.

## What Works

- Live ingestion works reliably on the tested public profiles. Apify returned full profile metadata, posts, carousel media URLs, comments, tags, and dataset IDs for all 5 profiles.
- Structural report generation is stable. Every report had all 17 required standard sections.
- Vision is strong. Only one selected visual item was skipped across 142 selected posts.
- The algorithm uses real evidence well when the profile has obvious public signals. `fakeev` and `mark.tales` produced coherent, source-backed, practical reports.
- Low sample coverage is visible. `fakeev` correctly warns that 30/1087 posts is only 2.8%, and frames conclusions as selected-public-post signals.
- The previous repair-instruction leakage bug appears improved. No fresh raw/report text contained `70+`, `3+ phrases`, `evidence-tied`, `respectful next steps`, `word-count`, or rubric-target wording.

## Remaining Issues

1. Repair does not reliably fix missing-source sections.

   `evachkaaaaa` ended with 3 source-less sections: `Профессия и статус`, `Отличие от типичных аккаунтов`, `Ошибки, слепые зоны, барьеры`. `_daria.bers_` ended with 2 source-less sections: `Профессия и статус`, `Ошибки, слепые зоны, барьеры`.

2. Generic negative-evidence sections are weak.

   Sections like "no profession hints found" often have no source and can read like internal analysis rather than a user-facing conclusion. These sections should cite profile-level public evidence or be rewritten into an explicit limitation.

3. One internal schema term still leaked.

   `_daria.bers_` included `No profession hints in profileSignals or selected posts` in a caveat. The QA layer caught it as `report:internal_schema_term_leak`, but the final report still shipped with the leak and score 61.

4. Practical sections are sometimes usable but too shallow.

   `missstaccyy`, `evachkaaaaa`, and `_daria.bers_` all had `content:weak_practical_detail`. They include hooks and phrases, but the next steps are often short and generic: "leave one comment", "wait for a response", "avoid personal questions". Useful, but not premium-feeling.

5. Quality and content scores can diverge confusingly.

   `missstaccyy` has report quality 100 but content quality 84 due weak practical detail. This is correct internally, but product UX should expose one clear customer-facing health signal or explain the two dimensions.

6. Eval script still writes a stale date.

   `FINDINGS.md` says `Date: 2026-06-08` for this 2026-06-12 run. This is a research-script bug and can mislead comparisons.

## Product Usefulness

For profiles with clear public themes, the reports are genuinely useful. They identify travel/work/lifestyle clusters, suggest concrete public-post hooks, provide ready phrases, and state confidence limits. The best reports (`mark.tales`, `fakeev`) are good enough to show to beta users.

For ambiguous personal profiles, the algorithm becomes less impressive. It still avoids overclaiming, which is good, but it sometimes fills low-evidence sections with generic caveats or unsupported "no data" text. This is safe, but not always valuable.

Current quality estimate:

- Technical pipeline reliability: high.
- Evidence grounding: medium-high.
- Vision coverage: high.
- Practical usefulness: medium to high, profile-dependent.
- Final polish: medium.
- Production readiness: beta-ready, not yet excellent.

## Recommended Fixes

1. Make missing-source sections hard repair blockers.

   If any final section has zero sources, run a second targeted repair or replace the section with a standardized "public data is insufficient" block that cites profile-level source and analyzed sample limits.

2. Sanitize schema terms after repair, not only score them.

   Add final text replacements or fail/repair on terms like `profileSignals`, `analysisContext`, `contentClusters`, `evidenceMap`, `sourceCatalog`, and `postIds`.

3. Add profile-level source support.

   For negative evidence sections such as "no profession hints", allow a profile-level source (`https://www.instagram.com/{username}/`) and include the analyzed sample caveat. This avoids false missing-source flags while keeping the claim grounded.

4. Strengthen practical detail requirements.

   For the five practical sections, require each section to include: concrete evidence, why it matters, 2-3 next actions, what not to do, and confidence/limit. The current rubric detects weakness, but repair still under-delivers.

5. Fix `renderFindings` run date.

   Use `new Date().toISOString().slice(0, 10)` or an `EVAL_RUN_DATE` env var instead of the hardcoded `2026-06-08`.

6. Consider a final "ship/no-ship" gate.

   If report quality < 80, source coverage < 17/17, or high severity findings remain, the user-facing bot should either run a final repair or label the report as limited rather than presenting it as a clean final analysis.

## Conclusion

The Instagram profile analysis algorithm is real and functional: it can ingest public profiles, analyze visuals, build structured evidence-backed reports, and produce practical recommendations. The reports are already useful for many beta cases.

The gap is not the core algorithm anymore. The gap is final QA enforcement. The system detects the same quality defects a human reviewer sees, but it still allows some of them to ship. Closing that last loop should materially improve trust and perceived report value.
