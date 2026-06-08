# Instagram Profile Eval

Date: 2026-06-08

Profiles: `evachkaaaaa`, `missstaccyy`, `_daria.bers_`, `fakeev`, `mark.tales`.

## Method

- Local `APIFY_TOKEN` is absent. In this environment the production container would use `MockInstagramProfileProvider`, so a normal bot run would not analyze these real profiles.
- For eval input I used Instagram's public `web_profile_info` web endpoint with a fresh cookie jar and the required web headers. It returned profile metadata, 12 recent posts, captions, like/comment counts, locations, tags, and CDN image URLs for all 5 public profiles.
- I then ran the current `buildStrategicReport` pipeline: post selection, metrics, vision step, final report generation, deterministic grounding, quality evaluation, and repair when triggered.
- First pass generated 4 reports. `mark.tales` had a transient fetch failure on that pass.
- During first pass every vision item was skipped because of a production bug in image downloading. The root cause was Node 22 calling the custom DNS `lookup` with `options.all=true` while the code always returned the single-address callback shape.
- I fixed that image-download bug and verified one Instagram CDN image returns `200 image/jpeg` through the corrected path. A second full LLM rerun was then blocked by OpenRouter `ACCESS_DENIED_CREDITS`, so the saved paid reports still reflect the pre-fix skipped-vision pass.

## Results

| Profile | Status | Followers | IG posts | Fetched posts | Engagement % | Vision | Sections | Source coverage | Quality now | Warnings |
|---|---|---:|---:|---:|---:|---|---:|---:|---:|---|
| `evachkaaaaa` | report completed | 1290 | 141 | 12 | 15.36 | skipped 12/12 | 17 | 17/17 | 92 | first-pass report had no warning |
| `missstaccyy` | report completed | 587 | 23 | 12 | 20.16 | skipped 12/12 | 17 | 17/17 | 92 | first-pass report had no warning |
| `_daria.bers_` | report completed | 748 | 118 | 12 | 14.02 | skipped 12/12 | 17 | 17/17 | 92 | first-pass report had no warning |
| `fakeev` | report completed | 57772 | 1087 | 12 | 0.42 | skipped 12/12 | 17 | 17/17 | 92 | first-pass had 2 grounding flags; fixed as profile-link source issue |
| `mark.tales` | profile only | 443 | 96 | 12 | n/a | n/a | n/a | n/a | n/a | OpenRouter credits blocked report rerun |

## Quality Review

The text report generator is useful but currently conservative and shallow when vision/comments are missing. It correctly produced all 17 standard sections, cited concrete post URLs, included confidence/caveat language, and avoided sensitive private-life claims. The reports repeatedly state important limitations: 12-post sample, no stories, no comment text, no visual analysis.

The most useful parts are: topic extraction, engagement metrics, communication hooks, safe first-message phrasing, absence-as-signal, and profile-specific caveats. These are practical for a user who wants a quick public-profile read.

The weakest parts are: visual sections, audience sections, and "difference from typical accounts." Without vision and comment text, those sections become metadata-only and sometimes generic. The first-pass saved reports scored 100, which overstated real usefulness; this is now addressed with quality penalties for missing vision evidence and count-only comments.

The `fakeev` grounding warning was a false positive: the report cited the public Telegram link from the profile bio, but the grounding source catalog originally contained only post URLs. I fixed `report-builder` so profile URL and `profile.externalUrl` are included in grounding.

## Algorithm Verdict

Current algorithm quality after fixes: promising but not production-complete.

- Ingestion: blocked locally without Apify. This is the biggest operational risk; with no `APIFY_TOKEN`, production-like runs silently use mock Instagram data.
- Vision: was fully broken on Node 22 before the DNS lookup fix. This directly reduced report depth.
- Report generation: structurally strong; it reliably creates complete, source-backed Russian reports.
- Safety/grounding: good posture, but source catalog needed profile-link support.
- Quality scoring: first-pass scoring was too lenient; after the fix, missing vision/comment detail lowers the score and adds warnings.
- Data coverage: 12 posts is enough for a first read, not enough for confident behavioral claims, especially on accounts with 100+ or 1000+ posts.

## Code Fixes Applied

1. `openrouter.adapter.ts`: fixed custom DNS lookup for Node `options.all=true`, restoring Instagram CDN image downloads for vision analysis.
2. `report-builder.ts`: added profile URL and `profile.externalUrl` to the grounding source catalog, preventing false fabricated-source flags for public bio links.
3. `report-quality.ts`: added quality findings for missing vision evidence and count-only comment evidence, so incomplete multimodal reports no longer look perfect.
4. Added `scripts/eval-public-instagram-profiles.ts` to reproduce this eval path and save profile/report artifacts.

## Recommendations

1. Treat missing Apify token as a hard "real ingestion unavailable" state in eval/production diagnostics; do not silently use mock profiles for real usernames.
2. For serious profile analysis, fetch more than the first 12 posts through Apify pagination and include latest comment text where allowed.
3. Add a small runtime diagnostic to report vision completion rate in the final user-facing summary.
4. Add a dedicated regression test around image download lookup behavior; the code path is fixed, but direct unit coverage is still indirect.
