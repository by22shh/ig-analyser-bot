# Analysis quality, evidence coverage and golden eval audit

Дата: 2026-06-12  
Phase: 4 — Audit Analysis Quality  
Scope: report builder, structured output, grounding, content-quality gates, current-code live eval, Fly production eval, golden contract.

## Verdict

Текущая локальная версия проходит высокий quality bar для paid report: golden eval passed for 5/5 profiles, all current-code live profiles completed, 17/17 sections were produced for every profile, source coverage was 17/17 for every profile, `deliveryHealth.status=ready` for every profile, and user-facing prompt/instruction leak scan found 0 matches in parsed report JSON.

Но "best-in-class" пока нельзя утверждать без оговорок:

- текущая локальная версия лучше Fly production по evidence depth for 4/5 profiles because it fetches up to 120 metadata posts instead of mostly 30;
- Fly production is healthy but not equal to local code and should not be marketed as the same quality until deployed;
- low-evidence/huge-profile case `fakeev` still has a content-quality score of 86 locally, barely above the golden threshold 85, and needs product copy/UX that makes sampling limits impossible to miss;
- all 5 current-code reports required accepted repair in live eval, which is good as a gate but means the first-pass model output is not yet consistently shippable.

## Metrics artifact

Machine-readable metrics: `docs/audit/2026-06-12-deep-product-audit/analysis-quality-metrics.json`.

Key values:

| Metric                             | Current local code live | Fly production live |
| ---------------------------------- | ----------------------: | ------------------: |
| Profiles completed                 |                     5/5 |                 5/5 |
| Failed profiles                    |                       0 |                   0 |
| Reports with 17/17 sections        |                     5/5 |                 5/5 |
| Reports with 17/17 source coverage |                     5/5 |                 5/5 |
| `deliveryHealth=ready`             |                     5/5 |                 5/5 |
| Min quality score                  |                      99 |                  93 |
| Avg quality score                  |                    99.8 |                98.6 |
| Min content-quality score          |                      86 |                  96 |
| Avg content-quality score          |                    96.0 |                98.6 |
| Avg fetched posts                  |                    90.8 |                28.4 |
| User-facing leak matches           |                       0 |                   0 |

## Golden eval

Command: `pnpm eval-golden`  
Log: `commands/phase-4/01.log`  
Result: exit `0`.

Golden contract in `docs/eval/golden-instagram-standard.json` requires:

| Requirement           | Threshold |
| --------------------- | --------: |
| Required sections     |        17 |
| Source coverage       |      100% |
| Vision completion     |       95% |
| Prompt leak matches   |         0 |
| Quality score         |     >= 90 |
| Content quality score |     >= 85 |
| Profiles              |         5 |

Observed command output: `Golden eval passed for 5 profiles in docs/research/2026-06-12-instagram-profile-eval-current-code-live`.

## Local vs Fly production divergence

| Profile        | Fly fetched posts | Current fetched posts | Delta | Fly quality/content | Current quality/content | Delivery       |
| -------------- | ----------------: | --------------------: | ----: | ------------------: | ----------------------: | -------------- |
| `evachkaaaaa`  |                30 |                   120 |   +90 |            100 / 96 |               100 / 100 | ready -> ready |
| `missstaccyy`  |                22 |                    22 |     0 |            100 / 97 |               100 / 100 | ready -> ready |
| `_daria.bers_` |                30 |                   118 |   +88 |           100 / 100 |                100 / 96 | ready -> ready |
| `fakeev`       |                30 |                   120 |   +90 |            93 / 100 |                 99 / 86 | ready -> ready |
| `mark.tales`   |                30 |                    74 |   +44 |           100 / 100 |                100 / 98 | ready -> ready |

Interpretation:

- Current local code has materially richer metadata/context on large profiles.
- Fly production is not broken, but it still reflects narrower sampling for most large profiles.
- The product verdict must separate "local repository after current work" from "currently deployed Fly".

## Required quality areas

| Area                               | Status               | Evidence                                                                                                   | Notes                                                                                |
| ---------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Required section coverage          | PASS                 | metrics JSON, 5/5 current-code profiles have 17/17 sections                                                | Golden threshold met.                                                                |
| Parsed section count               | PASS                 | each `*.report.json` has 17 parsed sections                                                                | Parser removes internal delimiters from user-facing sections.                        |
| Source coverage                    | PASS                 | 17/17 source coverage for all current-code and Fly profiles                                                | Missing-source sections are repair-worthy in unit tests.                             |
| `deliveryHealth`                   | PASS                 | 5/5 current-code and Fly profiles are `ready`                                                              | `failed_quality` path is unit-tested.                                                |
| Practical detail                   | PASS with watch item | targeted tests cover practical-requirements and content-quality; current min content score 86              | `fakeev` is close to threshold; keep as regression watch.                            |
| Low-evidence behavior              | PASS                 | `fakeev` warning exists for partial coverage; delivery remains ready with caveat                           | The warning is appropriate, but UX should make sampling scope very visible.          |
| Prompt/instruction leak resistance | PASS                 | user-facing parsed report scan found 0 matches; tests flag leaks                                           | Raw model outputs contain `[[SECTION]]` delimiters, but parsed report JSON does not. |
| Structured output fallback         | PASS                 | `tests/unit/structured-output.test.ts`, `tests/unit/openrouter-empty.test.ts`, report-builder repair tests | Empty/truncated/repair paths are covered.                                            |
| Parse failure behavior             | PASS                 | targeted report-builder tests cover missing sections, forbidden inference, targeted repair, failed quality | No deterministic bug found in this phase.                                            |

## Prompt-leak scan

Scope:

- User-facing parsed report JSON: `docs/research/2026-06-12-instagram-profile-eval-current-code-live/reports/*.report.json`
- Fly parsed report JSON: `docs/research/2026-06-12-instagram-profile-eval-fly-live-codex-current/reports/*.report.json`
- Raw model outputs were scanned separately to distinguish internal delimiters from shipped content.

Patterns checked included:

- `system prompt`
- `developer message`
- `internal rubric`
- `json schema`
- `delivery gate`
- `do not reveal`
- `repair instructions`
- `word-count target`
- `rubric target`
- `[[SECTION]]`

Results:

| Surface                      | Files scanned | User-facing matches | Internal raw section markers |
| ---------------------------- | ------------: | ------------------: | ---------------------------: |
| Current local parsed reports |             5 |                   0 |                          n/a |
| Fly parsed reports           |             5 |                   0 |                          n/a |
| Current raw model outputs    |             5 |                 n/a |                           85 |
| Fly raw model outputs        |             5 |                 n/a |                           85 |

The raw delimiter count is not a shipped-content leak based on current artifacts: `*.report.json` sections and report `rawText` contain no `[[SECTION]]` markers.

## Targeted quality tests

Command: targeted report quality Vitest suite  
Log: `commands/phase-4/02.log`  
Result: 8 files passed, 73 tests passed, exit `0`.

Covered areas:

- report repair when required sections are missing;
- forbidden inference and grounding repair;
- practical sections too thin;
- missing section sources;
- targeted ship-gate repair;
- failed-quality status after unrecoverable repair failure;
- internal schema term cleanup from summary and final section content;
- structured output and OpenRouter empty-response behavior.

## Quality risks and gaps

| Severity | Finding                                                                            | Impact                                                                                               | Recommendation                                                                                                           |
| -------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| P1       | Fly production is behind current local evidence depth                              | Users on deployed product may receive narrower reports than local eval suggests                      | Deploy current local report pipeline only after phases 5-8 remain green; keep local-vs-Fly distinction in final verdict. |
| P2       | First-pass model output frequently needs repair                                    | Quality gate catches issues, but latency/cost may be higher and provider drift can increase failures | Track repair rate as a production metric and alert if accepted repair rate or failed_quality rises.                      |
| P2       | `fakeev` low-coverage case is barely above content threshold locally               | Large-profile/low-sample reports can look confident unless warnings stay prominent                   | Strengthen UI/report summary language for partial coverage and add more low-evidence golden fixtures.                    |
| P2       | Raw model outputs preserve internal `[[SECTION]]` delimiters in research artifacts | Not user-facing now, but easy to misread in audits or accidentally expose                            | Keep parser cleanup tests; avoid exposing raw provider output to users/admin exports.                                    |

## Patch summary

No production code patch was applied in phase 4. No deterministic report-quality bug requiring a focused fix was found. Subjective/product quality gaps are recorded above for prioritization.
