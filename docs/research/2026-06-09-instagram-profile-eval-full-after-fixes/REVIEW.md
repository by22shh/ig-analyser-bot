# Full Instagram Analysis Test After Fixes

Date: 2026-06-09

Run path: `docs/research/2026-06-09-instagram-profile-eval-full-after-fixes`

Profiles: `evachkaaaaa`, `missstaccyy`, `_daria.bers_`, `fakeev`, `mark.tales`.

Scope: full production-like cycle with current `main` code at `3b2fbdf`: Apify profile ingestion, post/comment/media mapping, carousel-aware image attachments, vision analysis with JSON recovery/retry/quality gating, final report generation, grounding/report quality, analysis health, and stricter content-quality rubric.

## Verdict

The full pipeline completed for all 5 profiles. No profile failed.

The latest vision fix worked on the original problem: there were no raw JSON-shaped vision descriptions, no visibly truncated `{ "visibleFacts` descriptions, and no too-short completed descriptions. Two visual items were honestly marked as `skipped` because their Instagram CDN host did not resolve during image download, and those gaps were surfaced in report warnings.

The stricter content-quality rubric also worked: it no longer gives comfortable 95-100 scores to reports whose practical sections are short. This exposed a real product issue: reports are now technically grounded and transparent, but several practical sections are too compressed, especially for `missstaccyy` and `_daria.bers_`.

## Summary

| Profile | Status | Posts Read | Format | Vision | Report Quality | Content Quality | Main Warnings |
|---|---|---:|---|---:|---:|---:|---|
| `evachkaaaaa` | completed | 30/141 | recent 30-post read | 30/30 | 100 | 61 | none |
| `missstaccyy` | completed | 22/23 | near-full public-post read | 22/22 | 100 | 64 | none |
| `_daria.bers_` | completed | 30/118 | recent 30-post read | 29/30 | 93 | 47 | vision gap |
| `fakeev` | completed | 30/1087 | recent 30-post read | 30/30 | 93 | 72 | very low sample coverage |
| `mark.tales` | completed | 30/96 | recent 30-post read | 29/30 | 93 | 72 | vision gap |

## Vision / Carousel

| Profile | Image Attachments | Carousel Posts | Raw JSON Vision | Truncated Vision | Short Completed Vision | Non-completed Vision |
|---|---:|---:|---:|---:|---:|---|
| `_daria.bers_` | 83 | 28 | 0 | 0 | 0 | 1 skipped |
| `evachkaaaaa` | 68 | 19 | 0 | 0 | 0 | 0 |
| `fakeev` | 46 | 9 | 0 | 0 | 0 | 0 |
| `mark.tales` | 54 | 12 | 0 | 0 | 0 | 1 skipped |
| `missstaccyy` | 37 | 13 | 0 | 0 | 0 | 0 |
| **Total** | **288** | **81** | **0** | **0** | **0** | **2 skipped** |

Skipped items:
- `_daria.bers_`, post `3786123220051589800`: `getaddrinfo ENOTFOUND instagram.fcps4-1.fna.fbcdn.net`
- `mark.tales`, post `3718687361199797951`: `getaddrinfo ENOTFOUND instagram.ftpa1-1.fna.fbcdn.net`

Both skipped posts were cited only in the "Ошибки, слепые зоны, барьеры" section as vision limitations, not as normal visual evidence. This is the desired behavior.

## Report Health

The new health block is present and accurate in every report:

- `fakeev` clearly says `recent 30-post read` and warns that 30/1087 is only 2.8% coverage.
- `missstaccyy` correctly says `near-full public-post read` with 22/23 posts and no low-coverage warning.
- `_daria.bers_` and `mark.tales` show `vision 29/30` and include a vision-coverage warning.
- Comment coverage is visible for every report.

## Final Report Content

No final report leaked internal schema terms such as `analysisContext`, `visibleFacts`, `contentClusters`, or `sourceCatalog`.

No forbidden/sensitive lexeme hits were detected in final report prose.

However, many sections are short:

| Profile | Min Section Words | Sections Under 45 Words |
|---|---:|---:|
| `_daria.bers_` | 31 | 10 |
| `evachkaaaaa` | 34 | 8 |
| `fakeev` | 44 | 1 |
| `mark.tales` | 38 | 3 |
| `missstaccyy` | 32 | 12 |

The most common weakness is practical compression:
- "Потенциальная польза от контакта" often gives a general theme but not enough concrete value.
- "Коммуникационные рекомендации" is safe but short.
- "Готовые фразы" can still be too generic; in `missstaccyy` it did not actually include the phrases in this run.
- "Общая оценка ценности профиля" is often correct but too brief.

## Quality Interpretation

Report quality and content quality now measure different things:

- Report quality checks structure, sources, grounding, schema leaks, coverage, and vision gaps.
- Content quality checks whether the text is actually useful enough for a user.

That split is working. For example:

- `missstaccyy`: report quality 100, content quality 64. Structurally complete, but practical sections are too thin.
- `_daria.bers_`: report quality 93, content quality 47. Vision gap plus very compressed practical value sections.
- `fakeev`: report quality 93, content quality 72. Correctly warns about very low sample coverage; useful but still not rich enough in action guidance.

## Conclusion

The algorithm now completes the full analysis cycle and surfaces uncertainty much more honestly than before. The vision-stage hardening fixed the raw/truncated JSON evidence problem in this run.

The remaining product-quality issue is the final report generation style: it is too concise in user-action sections. The next improvement should force richer practical sections in the final prompt/schema, especially:

- minimum 3 concrete hooks;
- actual ready-to-send phrases in every "Готовые фразы" section;
- 2-3 next-step recommendations in "Коммуникационные рекомендации";
- explicit "why this matters" in "Потенциальная польза от контакта";
- stronger repair trigger when content-quality flags key sections.

