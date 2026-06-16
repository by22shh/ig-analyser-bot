# Instagram Analysis Algorithm Review

Date: 2026-06-12

Run path: `docs/research/2026-06-12-instagram-profile-eval-fly-live-codex-current`

Scope: live Fly production runtime, Fly-provided `APIFY_TOKEN` and `OPENROUTER_API_KEY`, Apify `apify~instagram-scraper` ingestion, deployed `buildStrategicReport` pipeline, OpenRouter vision/reasoning, grounding, repair, source sanitization, delivery gate, quality and content-quality scoring.

Not covered: Telegram credits/queue UX, PDF export, report chat, private profiles, and non-standard modes (`influencer`, `hr`, `osint_compliance`).

## Verdict

The profile-analysis algorithm is working and is useful enough for beta/production usage in Standard mode.

In this fresh live run all 5 public profiles completed, all reports had 17/17 required sections, all sections had sources, all 142 selected posts completed vision analysis, and no user-facing prompt/repair instruction leaks were found in raw report text.

The quality is materially better than earlier saved runs. The product framing is intentionally communication-oriented: the reports are designed to find safe hooks, conversation openings, and practical next steps from public Instagram evidence. The remaining concern is not basic correctness or positioning; it is calibration and operational polish: every final report relied on the repair path (`report.standard.v7.repair`), and the score can still look a little too perfect for reports that are inherently limited by partial public data.

## Run Summary

| Profile | Coverage | Vision | Sections | Sources | Quality | Content | Delivery | Warnings |
|---|---:|---:|---:|---:|---:|---:|---|---|
| `evachkaaaaa` | 30/141 | 30/30 | 17 | 17/17 | 100 | 96 | ready | none |
| `missstaccyy` | 22/23 | 22/22 | 17 | 17/17 | 100 | 97 | ready | none |
| `_daria.bers_` | 30/118 | 30/30 | 17 | 17/17 | 100 | 100 | ready | none |
| `fakeev` | 30/1087 | 30/30 | 17 | 17/17 | 93 | 100 | ready | low sample coverage |
| `mark.tales` | 30/94 | 30/30 | 17 | 17/17 | 100 | 100 | ready | none |

Aggregate input: 142 selected posts from 1,463 public profile posts, 82 carousel-like posts, 443 media URLs, 412 latest comments.

## What Works

- Production ingest works: Apify returned real profile/post/comment/media data for all 5 handles.
- Vision is stable in this run: 142/142 completed, no skipped CDN images, no raw/truncated structured JSON in final vision descriptions.
- Structural report generation is reliable after repair: 5/5 reports have all 17 Standard sections.
- Source grounding is healthy: 85/85 sections have at least one source, no fabricated external URLs were observed in final raw text.
- Safety/caution framing is present: reports repeatedly say conclusions are from public data, avoid private-life/status/relationship assertions, and advise not to continue contact without response.
- Low-coverage handling works on `fakeev`: the report explicitly flags 30/1087 posts (2.8%) and limits conclusions to the selected recent public sample.
- Practical value is now real: reports include concrete hooks, first steps, what not to write, and ready phrases tied to public posts.

## Comparison

| Run | Completed | Avg quality | Avg content | Vision | Source issues | Prompt leaks in raw |
|---|---:|---:|---:|---|---|---:|
| 2026-06-09 after fixes | 5/5 | 95.8 | 63.2 | 140 completed, 2 skipped | none | not rechecked here |
| 2026-06-12 earlier prod Apify live | 5/5 | 94.4 | 96.4 | 139 completed, 3 skipped | `mark.tales` 16/17 | 3 |
| 2026-06-12 current Fly live | 5/5 | 98.6 | 98.6 | 142 completed | none | 0 |

## Remaining Risks

1. Repair is effectively part of the happy path.

   All 5 final reports have prompt version `report.standard.v7.repair`. The repair loop is doing valuable work, but this means latency and cost depend on multiple LLM calls. Production monitoring should track initial-generation failure reasons, repair count, and targeted-repair count separately.

2. `deliveryHealth.repaired` is semantically confusing.

   In the current code it reflects targeted delivery-gate repair, not whether the normal repair pass changed the report. This can make dashboards undercount how often reports rely on repair.

3. Scores are slightly overconfident.

   Four reports score 100 quality and three score 100 content. Manual reading agrees they are good, but a perfect score hides natural limitations: partial profile coverage, missing stories/Direct, and small comment samples.

4. Coverage thresholds should be more visible beyond very-low coverage.

   `fakeev` is handled well at 2.8%. Accounts with 21-32% coverage (`evachkaaaaa`, `_daria.bers_`, `mark.tales`) mention limitations in sections, but the top-level warnings stay empty. A soft warning for partial coverage would make the quality signal more honest.

## Recommended Fixes

1. Add telemetry fields: `initialRepairAttempted`, `initialRepairAccepted`, `targetedRepairAttempted`, `deliveryGateBeforeRepair`, and LLM latency/cost by phase.
2. Rename or extend `deliveryHealth.repaired` so it does not hide non-targeted repair usage.
3. Cap quality/content scores below 100 when coverage is partial, stories are unavailable, or comment text coverage is low, even if the report is otherwise good.
4. Add a top-level warning for partial coverage below 35%, not only very-low coverage below 5%.
5. Keep Standard mode explicitly communication-oriented in product copy, so users understand that the output is about safe hooks and practical communication, not a neutral biography or personality diagnosis.

## Product Conclusion

The algorithm now produces coherent, sourced, practically useful communication-oriented Instagram-profile reports on real public profiles. I would trust it for controlled beta users and paid reports with clear public-data caveats.

I would not yet call it a finished "excellent" analyzer: it needs better observability around repair, more honest score calibration, and clearer top-level coverage warnings.
