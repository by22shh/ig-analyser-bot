# Instagram Analysis Rerun Review

Date: 2026-06-08

Run path: `docs/research/2026-06-08-instagram-profile-eval-rerun-full`

Scope: fresh Apify ingestion + carousel-aware vision + final reasoning report for `evachkaaaaa`, `missstaccyy`, `_daria.bers_`, `fakeev`, `mark.tales`.

Runtime note: production Apify/OpenRouter keys were read from the Fly runtime environment without printing or storing secret values. The run used the current local code, not the deployed image, because the deployed image did not yet contain the new analysis-health/carousel/content-quality changes.

## Executive Verdict

The core report pipeline now works materially better than before: every final report has an executive summary, visible analysis-health metadata, complete section/source coverage, and calibrated coverage wording. The `fakeev` case correctly exposes the main risk: only 30 of 1087 posts were analyzed, so the report explicitly frames itself as a `recent 30-post read`.

The main remaining weakness is inside the vision evidence layer: all 142 post-level vision calls completed, and carousel children were sent, but 19 of 142 vision descriptions came back as raw JSON-shaped text and 11 were too short or visibly truncated. The final reports did not leak those internal JSON keys, but some sections cite posts whose visual description is weak, so the next fix should make vision parsing/repair stricter.

## Report Health

| Profile | Posts Read | Coverage | Format | Vision | Comment Coverage | Quality | Content Quality | Warnings |
|---|---:|---:|---|---:|---:|---:|---:|---|
| `evachkaaaaa` | 30/141 | 21.3% | recent 30-post read | 30/30 | 24/30, 80.0% | 100 | 99 | none |
| `missstaccyy` | 22/23 | 95.7% | near-full public-post read | 22/22 | 16/22, 72.7% | 100 | 95 | none |
| `_daria.bers_` | 30/118 | 25.4% | recent 30-post read | 30/30 | 19/30, 63.3% | 100 | 100 | none |
| `fakeev` | 30/1087 | 2.8% | recent 30-post read | 30/30 | 29/30, 96.7% | 93 | 100 | very low sample coverage |
| `mark.tales` | 30/96 | 31.3% | recent 30-post read | 30/30 | 16/30, 53.3% | 100 | 100 | none |

## Vision / Photo Descriptions

| Profile | Post Vision | Image Attachments | Carousel Posts | Raw JSON-shaped Descriptions | Short/Truncated Descriptions | Section Refs To Weak Vision |
|---|---:|---:|---:|---:|---:|---:|
| `_daria.bers_` | 30/30 | 83 | 28 | 4 | 1 | 13 |
| `evachkaaaaa` | 30/30 | 68 | 19 | 6 | 4 | 1 |
| `fakeev` | 30/30 | 46 | 9 | 5 | 3 | 2 |
| `mark.tales` | 30/30 | 54 | 12 | 2 | 2 | 0 |
| `missstaccyy` | 22/22 | 37 | 13 | 2 | 1 | 1 |
| **Total** | **142/142** | **288** | **81** | **19** | **11** | **17** |

What worked:
- Carousel child images are definitely being analyzed. The run attached 288 images for 142 posts, with multi-image notes like `Images analyzed: 3/3`.
- The good descriptions are useful: they identify settings, objects, visible text, repeated visual patterns, and carousel differences.
- No image-download failures occurred in this run.

What did not fully work:
- Some structured vision responses were not rendered back into clean prose; they were stored as raw JSON-shaped snippets.
- A smaller subset was visibly truncated, for example ending after `{ "visibleFacts`.
- These weak vision items did not leak into final prose, but they can still weaken source evidence when cited.

Recommended fix:
- Parse/render vision JSON even when the provider response is not marked as structured.
- If parsing fails or the description is under a minimum length, retry once in text fallback mode.
- If retry still fails, mark the item as `failed` or `low_quality` instead of `completed`, so analysis-health does not overstate vision quality.

## Final Report Quality

`evachkaaaaa`: useful and concrete. The report identifies travel/urban aesthetics, gives safe entry phrases, and states that the 30 posts are only 21.3% of the profile. Practical value is good; the main limitation is that conclusions remain travel-heavy because the recent sample is travel-heavy.

`missstaccyy`: accurate and appropriately cautious. The near-full coverage label is correct. The report recognizes the account has sparse captions and few professional signals. Weakness: several sections are short, so the report is useful but less rich than the score suggests.

`_daria.bers_`: strong travel/photo-diary analysis with good hooks and caveats. Caveat: 13 section sources reference posts that had weak/raw vision descriptions, although many of those references also use captions, metrics, or comments.

`fakeev`: the best stress test. The report correctly warns about 2.8% coverage and does not pretend to describe the whole profile. It is useful for a recent-public-content read around crypto/investment/conferences, but it should not be treated as a full-account audit.

`mark.tales`: practical and grounded around travel/moto themes. Good communication recommendations and caveats. Comment coverage is only 53.3%, so audience/style conclusions should stay medium-confidence.

## Overall Assessment

The final reports are now useful enough for users: they give concrete themes, confidence limits, safe conversation hooks, and explicit data coverage. The health block solves the biggest trust problem because users can see exactly how much data the analysis saw.

The next highest-leverage improvement is not another prompt tweak for the final report. It is hardening the vision stage quality gate, because the final report depends on that evidence. After that, the content-quality rubric should be made less forgiving for short but source-backed sections, especially in near-full profiles with sparse text.
