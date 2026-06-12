# After Gate Recheck

Date: 2026-06-12

Run path: `docs/research/2026-06-12-instagram-profile-eval-prod-apify-after-gate-rerun`

Profiles: `evachkaaaaa`, `missstaccyy`, `_daria.bers_`, `fakeev`, `mark.tales`.

Scope: production-like Apify/OpenRouter live rerun after adding final delivery health, ship/no-ship gate, targeted repair payload, low-evidence templates, stronger practical requirements, source fallback, and schema-term cleanup.

## Result

The recheck passed.

All 5 profiles completed. All 5 reports generated the required 17 sections. Source coverage is now 85/85 sections. No report/raw text contains the previous internal leaks (`70+`, `3+ phrases`, `evidence-tied`, `respectful next steps`) or schema terms (`analysisContext`, `profileSignals`, `contentClusters`, `sourceCatalog`, `postIds`, etc.).

## Summary

| Profile | Coverage | Vision | Sources | Quality | Content | Delivery |
|---|---:|---:|---:|---:|---:|---|
| `evachkaaaaa` | 30/141 | 26/30 completed, 3 skipped, 1 low_quality | 17/17 | 93 | 100 | ready |
| `missstaccyy` | 22/23 | 22/22 completed | 17/17 | 100 | 97 | ready |
| `_daria.bers_` | 30/118 | 30/30 completed | 17/17 | 100 | 96 | ready |
| `fakeev` | 30/1087 | 29/30 completed, 1 skipped | 17/17 | 86 | 95 | ready |
| `mark.tales` | 30/94 | 30/30 completed | 17/17 | 100 | 100 | ready |

## Comparison With Previous Codex Rerun

| Profile | Quality | Content | Sources |
|---|---:|---:|---:|
| `evachkaaaaa` | 65 -> 93 | 84 -> 100 | 14/17 -> 17/17 |
| `missstaccyy` | 100 -> 100 | 84 -> 97 | 17/17 -> 17/17 |
| `_daria.bers_` | 61 -> 100 | 78 -> 96 | 15/17 -> 17/17 |
| `fakeev` | 86 -> 86 | 97 -> 95 | 17/17 -> 17/17 |
| `mark.tales` | 100 -> 100 | 96 -> 100 | 17/17 -> 17/17 |

## Notes

- `evachkaaaaa` improved strongly, but the run had worse image fetch/vision coverage than before: 26/30 completed, 3 skipped, 1 low_quality. The report surfaces this as a warning.
- `fakeev` remains a limited-evidence case by nature: only 30/1087 posts were analyzed, and the report warns that conclusions describe selected public posts, not the whole profile.
- Under the implemented gate, `deliveryHealth.status=ready` means the report passes the hard delivery thresholds: quality >= 80, contentQuality >= 85, no high findings, and full source coverage. It can still include visible limitations such as low sample coverage or vision gaps.

## Verdict

The fixes worked for the defects found in the previous analysis:

- source gaps are gone;
- schema/instruction leaks are gone;
- practical content scores improved;
- low-evidence personal-profile cases are now much more stable;
- final `deliveryHealth` exists in report JSON and reports are no longer silently shipped with hard quality blockers.

The remaining product decision is whether medium warnings such as very low sample coverage or partial vision coverage should downgrade `deliveryHealth` from `ready` to `limited`. The current gate treats them as visible warnings, not hard delivery blockers.
