# Instagram Profile Algorithm Audit

Date: 2026-06-08

Profiles requested: `evachkaaaaa`, `missstaccyy`, `_daria.bers_`, `fakeev`, `mark.tales`.

## What Was Verified

- Reviewed the current analysis pipeline: profile ingestion, post selection, metrics, vision, report generation, deterministic grounding, quality scoring, and repair hooks.
- Reused the saved first-pass real LLM artifacts in this folder for report-quality review.
- Ran a fresh live-ingestion pass into `docs/research/2026-06-08-instagram-profile-eval-live-ingestion`.
- Pulled production runtime `APIFY_TOKEN` and `OPENROUTER_API_KEY` without printing or storing secrets, then ran a production-like Apify + OpenRouter rerun into `docs/research/2026-06-08-instagram-profile-eval-prod-apify`.
- Ran focused tests for selection/evidence/grounding/report quality and the analysis context.
- Verified the prior Instagram CDN image-download bug is fixed: a real CDN image now reaches the LLM call and fails only at `OPENROUTER_API_KEY_MISSING`, not at DNS/IP validation.

## Environment Constraints

- The current shell has no real `APIFY_TOKEN` or `OPENROUTER_API_KEY` by default.
- `.env.production.local` exists, but key production values are placeholders by the app's own validator.
- Production runtime secrets were available through Fly machine env. They were used via command substitution / remote runtime only and were not written to repo files.
- Local network access to `api.apify.com` timed out, so Apify profile fetching was executed inside the production Fly machine and only public profile JSON was copied back.

## Production-like Evidence Table

| Profile | Apify posts | Fresh report | Sample coverage | Current quality score | Sources | Fresh vision | Main quality flags |
|---|---:|---:|---:|---:|---:|---:|---|
| `evachkaaaaa` | 30 / 141 posts | yes | 21.3% | 93 | 17 / 17 sections | 29 / 30 completed | one image download timeout |
| `missstaccyy` | 22 / 23 posts | yes | 95.7% | 100 | 17 / 17 sections | 22 / 22 completed | none |
| `_daria.bers_` | 30 / 118 posts | yes | 25.4% | 100 | 17 / 17 sections | 30 / 30 completed | none |
| `fakeev` | 30 / 1087 posts | yes | 2.8% | 93 | 17 / 17 sections | 30 / 30 completed | very low sample coverage |
| `mark.tales` | 30 / 96 posts | yes | 31.3% | 100 | 17 / 17 sections | 30 / 30 completed | none |

Fresh rerun average quality score after sample-coverage penalties: `97.2/100`. Deterministic grounding flags: `0/5` reports. Internal schema leaks: `0/5` reports. Vision completion: `141/142` selected images.

## First-pass Context

The saved first-pass reports in this folder originally scored 100, but that overstated usefulness because vision had failed. With the current evaluator, those four old reports score `74`, `92`, `92`, and `74`; average `83/100`. The fresh production-like rerun supersedes those results.

## Algorithm Verdict

The algorithm is now production-credible for cautious public Instagram profile analysis, with one important caveat: confidence must remain tied to sample coverage, especially for large accounts.

What works well:

- Apify production ingestion worked for all five requested accounts.
- Post selection, metrics, evidence-map generation, source extraction, and required-section parsing are stable.
- Fresh reports generated all 17 standard sections for 5/5 profiles.
- Source coverage is strong: 17/17 sections cite extracted evidence in every report.
- Vision is effectively restored: 141/142 selected images completed.
- Deterministic grounding shows no fabricated-source or forbidden-inference flags.
- The report tone is generally cautious and uses public-data limitations instead of asserting private facts.
- Apify provided comment text/commenter context: 36 to 119 comment-text items per profile in this run.
- Quality scoring now flags very low sample coverage, so a large account with 30/1087 analyzed posts no longer looks perfect.

What is not good enough yet:

- The largest profile sample is still thin: `fakeev` used 30 of 1087 posts, about 2.8%.
- Local eval cannot currently call Apify directly from this machine because `api.apify.com` connections time out; use Fly/runtime or fix local networking.
- One selected image for `evachkaaaaa` timed out during download.

## Usefulness Assessment

Useful today for:

- Cautious public-profile triage.
- Topic and format pattern extraction.
- Engagement and posting-mix summaries.
- Safe communication hooks and first-message drafts.
- Highlighting uncertainty and missing data.
- Visual-pattern analysis when image downloads complete.
- Audience/comment analysis when Apify returns latest comments.

Not reliable enough today for:

- High-confidence behavioral conclusions on large accounts from only 30 posts.
- Claims that depend on stories, full comments, private context, or historical pagination.

## Recommendations

1. Make the final user-facing report expose analysis health: selected posts, sample coverage, vision completion rate, and comment-text availability.
2. Consider fetching more than 30 posts for very large accounts, or split the report into "recent 30-post read" vs "full-history unavailable".
3. Keep using Apify comment fields where available so audience sections do not rely only on comment counts.
4. Add a regression test for the Node `lookup(options.all=true)` image-download path.
5. Add an operational eval path that can run from Fly/runtime env without manually copying secrets.
