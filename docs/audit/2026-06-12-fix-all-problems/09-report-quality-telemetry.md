# Phase 10: Report quality telemetry

Дата: 2026-06-13 Asia/Novosibirsk

## What changed

Added compact quality telemetry for report generation, persisted it in report summary metadata and emitted best-effort `api_usage_events` for repair, failed-quality and low-evidence signals. Also removed raw `[[SECTION]]` markers from user-facing report surfaces and added a Fly live eval checklist before any production quality claim.

## Deliverables

- `src/modules/analysis/quality-telemetry.ts`
- `src/modules/analysis/report-builder.ts`
- `src/jobs/workers/analysis.worker.ts`
- `src/modules/reports/user-facing-text.ts`
- `src/modules/reports/export.ts`
- `src/modules/chat/context.ts`
- `src/mini-app/routes.ts`
- `scripts/ops/fly-live-eval-checklist.ts`
- `docs/operations/fly-live-eval.md`
- package script `eval:fly-checklist`

## Telemetry diff excerpt

`ReportQualityTelemetry` records only compact booleans, scores, counts and status codes:

```ts
repairInitialAttempted;
repairInitialSucceeded;
repairInitialFailed;
repairTargetedAttempted;
repairTargetedSucceeded;
repairTargetedFailed;
failedQuality;
lowEvidence;
veryLowEvidence;
lowEvidenceLevel;
qualityScore;
contentQualityScore;
sourceCoverage;
```

The worker converts those fields into usage events:

```ts
operation: "report_quality_gate" |
  "report_repair_initial" |
  "report_repair_targeted" |
  "report_low_evidence_flag";
provider: "analysis_quality";
status: "success" | "failed";
errorCode: "FAILED_QUALITY" | "REPAIR_NOT_ACCEPTED" | "VERY_LOW_EVIDENCE" | "LOW_EVIDENCE" | null;
```

No prompt text, raw report text, provider payload or secret-shaped value is written to these usage events.

## Low-evidence and marker guards

- Large-profile low-evidence fixtures assert prominent sample coverage warnings, `lowEvidence` telemetry and explicit `Confidence: medium` language.
- `stripSectionMarkers` is applied to final report raw text, Mini App report details/list summaries, chat context fallbacks and Markdown/HTML exports.
- Unit tests cover legacy raw text and summary fields containing `[[SECTION]]`, so old saved rows are cleaned at read/export time.

## Golden eval summary

`pnpm eval-golden`:

```text
Golden eval passed for 5 profiles in docs/research/2026-06-12-instagram-profile-eval-current-code-live
```

## Fly parity checklist

`docs/operations/fly-live-eval.md` and `pnpm eval:fly-checklist -- ig-analyser-bot` state that production quality claims require:

1. local gates,
2. Fly deploy of the exact revision,
3. Fly runtime health checks,
4. live eval artifacts from the deployed Fly/runtime environment,
5. `pnpm eval-golden <fly-live-eval-dir>`.

## Validation

Command logs are under `docs/audit/2026-06-12-fix-all-problems/commands/phase-10/`.

| Command                                                                                                                                                                                        | Exit | Log                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: | ----------------------------- |
| `pnpm exec vitest run tests/unit/report-builder.test.ts tests/unit/report-quality.test.ts tests/unit/content-quality.test.ts tests/unit/analysis-context.test.ts tests/unit/grounding.test.ts` |    0 | `quality-tests.log`           |
| `pnpm eval-golden`                                                                                                                                                                             |    0 | `eval-golden.log`             |
| `pnpm typecheck`                                                                                                                                                                               |    0 | `typecheck.log`               |
| `pnpm lint`                                                                                                                                                                                    |    0 | `lint.log`                    |
| `pnpm eval:fly-checklist -- ig-analyser-bot`                                                                                                                                                   |    0 | `fly-live-eval-checklist.log` |
