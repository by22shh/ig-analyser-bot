# Instagram Profile Analysis Algorithm Review

Date: 2026-06-12

Run path: `docs/research/2026-06-12-instagram-profile-eval-prod-apify-live`

Profiles: `evachkaaaaa`, `missstaccyy`, `_daria.bers_`, `fakeev`, `mark.tales`.

Scope: production-like run using Fly-provided `APIFY_TOKEN` and `OPENROUTER_API_KEY`, Apify `apify~instagram-scraper` ingestion, current local `buildStrategicReport` pipeline, OpenRouter vision/reasoning, deterministic grounding, repair, and report/content quality scoring.

## Verdict

The algorithm works end-to-end on real public Instagram profiles. All 5 profiles completed, every report had the required 17 sections, source coverage was high, and the previous raw/truncated vision JSON problem did not reproduce.

The generated reports are now materially more useful than the 2026-06-09 run: practical sections usually include concrete hooks, ready-to-send phrases, next steps, caveats, and sample-coverage framing. The biggest remaining product issue is polish and QA calibration: repair guidance leaks into user-facing prose (`70+ words`, `3+ phrases`, `evidence-tied hooks`, `respectful next steps`), and the quality rubrics rate several reports too generously despite those leaks or a missing source.

## Run Summary

| Profile | Coverage | Vision | Report quality | Content quality | Source coverage | Prompt | Main warning |
|---|---:|---:|---:|---:|---:|---|---|
| `evachkaaaaa` | 30/141 (21.3%) | 30/30 | 100 | 100 | 17/17 | `report.standard.v7.repair` | none |
| `missstaccyy` | 22/23 (95.7%) | 20/22 | 93 | 100 | 17/17 | `report.standard.v7.repair` | 2 vision skips |
| `_daria.bers_` | 30/118 (25.4%) | 29/30 | 93 | 97 | 17/17 | `report.standard.v7.repair` | 1 vision skip |
| `fakeev` | 30/1087 (2.8%) | 30/30 | 93 | 87 | 17/17 | `report.standard.v7` | very low sample coverage |
| `mark.tales` | 30/94 (31.9%) | 30/30 | 93 | 98 | 16/17 | `report.standard.v7.repair` | one section without source |

Aggregate: 142 selected posts from 1,463 total public posts; 139/142 vision items completed; 3 skipped because Instagram CDN hostnames did not resolve; profile snapshots contained 82 carousel posts and 443 media URLs.

## What Works

- Real production provider path works: Apify profile/post/comment/media ingestion completed for all 5 profiles.
- Report generation is structurally reliable: 5/5 reports had all 17 required sections.
- Grounding is mostly effective: 84/85 sections had extracted sources, and unknown external URLs were not observed in final raw reports.
- Vision is stable: 139 completed vision descriptions had no raw JSON, no truncated `{ "visibleFacts" ...` shape, and no too-short completed descriptions.
- Health transparency is good: `fakeev` clearly warns that 30/1087 posts is only 2.8% coverage, and skipped vision items are surfaced in warnings.
- Practical value is much better than the previous run: ready phrases are present for all profiles, usually 3 concrete phrases tied to public posts.

## Remaining Issues

1. User-facing prompt leakage in repaired reports.

   Raw reports contain 12 occurrences of `70+`, one `3+ фраз`, one `evidence-tied`, and two `respectful next`. This is caused by the practical repair/guidance wording being copied literally. It makes reports feel machine-generated and should be treated as a product-quality bug.

2. Quality scoring is too generous.

   `evachkaaaaa`, `missstaccyy`, and `mark.tales` received content quality 98-100 despite prompt leakage or a missing-source section. The rubric currently rewards word count and practical markers, but does not penalize instruction leakage such as `70+ words`, nor does content quality see missing sources directly.

3. Missing-source section can survive repair.

   `mark.tales` has 16/17 source coverage. The section `Ошибки, слепые зоны, барьеры` has no extracted source and only 41 words, but the final report still ships with quality 93 and content quality 98.

4. Eval report date is stale.

   The generated `FINDINGS.md` says `Date: 2026-06-08` even though this run was on 2026-06-12. This is an eval-script bug, not a product-analysis bug, but it can mislead future research comparisons.

5. Some practical recommendations are useful but still shallow for high-value users.

   `fakeev` is the clearest example: recommendations are safe and relevant, but generic for a professional/investment account. The content rubric catches this partially (`content:weak_practical_detail`, score 87), but the report could give sharper, more role-aware next actions.

## Comparison With 2026-06-09

The 2026-06-09 run completed technically, but practical sections were often too compressed. Content-quality scores then were: `evachkaaaaa` 61, `missstaccyy` 64, `_daria.bers_` 47, `fakeev` 72, `mark.tales` 72.

This run improved practical richness strongly: current content-quality scores are 100, 100, 97, 87, 98. Manual review confirms that the improvement is real: reports now include concrete hooks, ready phrases, and "do not do this" advice. However, the numeric jump overstates quality because the scoring does not penalize repair-instruction leakage.

## Recommended Fixes

1. Add an internal-instruction leakage detector to report/content quality:
   - `70+`, `3+ фраз`, `3+ phrases`, `evidence-tied`, `respectful next steps`, `ready-to-send neutral phrases`, `word count`, `min words`.
   - Severity should be high or repair-worthy, because these strings are user-visible polish defects.

2. Rewrite practical repair hints so they are impossible to copy verbatim:
   - Instead of "at least 3 evidence-tied hooks", say "write three concrete examples, each grounded in a named post, but do not mention this instruction".
   - Add an explicit ban: never mention word-count targets, rubric targets, or phrase-count targets in the report.

3. Make missing sources repair-worthy even when there is only one affected section.

4. Re-run repair after source sanitization or validate sanitized sections before final return. `mark.tales` likely had source-like text that failed extraction/sanitization, leaving a zero-source section after repair.

5. Fix `scripts/eval-public-instagram-profiles.ts` so `FINDINGS.md` uses the actual run date or `new Date().toISOString().slice(0, 10)`.

## Product Conclusion

The algorithm is now useful enough for real beta users: it completes reliably, uses real evidence, avoids most overconfident private-life claims, and gives practical conversation hooks. It is not yet polished enough to call "excellent" or fully production-grade from a report-quality standpoint. The next quality step is not more data ingestion; it is stricter final-output QA and repair for user-facing text leaks, missing sources, and more domain-specific recommendations on professional profiles.
