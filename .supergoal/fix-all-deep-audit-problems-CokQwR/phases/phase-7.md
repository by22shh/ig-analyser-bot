SUPERGOAL_PHASE_START
Phase: 7 of 12 - Provider Smoke Gate
Task: Build one safe staging smoke runner for provider contracts, storage and PDF.
Type: brownfield, hardening, ops
Mandatory commands: pnpm exec vitest run tests/unit/provider-contract-smoke.test.ts, pnpm smoke:staging -- --dry-run, pnpm typecheck, pnpm lint
Acceptance criteria: 5
Evidence required: smoke dry-run output, test summary, docs excerpt
Depends on phases: 3, 6

## Why

The integration layer has good unit tests, but no unified release gate across Telegram, YooKassa, OpenRouter, Apify, FaceCheck, S3 and PDF.

## Work

- Add `scripts/smoke/provider-contract-smoke.ts`.
- Add step-selection, dry-run mode, and explicit live/staging opt-in.
- Add tests for dry-run output, missing env failures, secret redaction, and provider selection.
- Add `docs/operations/provider-smoke.md`.
- Add `smoke:staging` package script.

## Acceptance criteria

- [ ] Smoke runner has safe default dry-run mode and explicit live/staging opt-in.
- [ ] It covers Telegram webhook config, YooKassa test webhook/payment metadata, OpenRouter structured/fallback, Apify actor/dataset, FaceCheck demo/mock/prod mode boundary, S3 signed URL, and PDF render dependency.
- [ ] Live mode refuses to run if required env vars are absent and never prints secret values.
- [ ] Tests cover dry-run output, missing-secret failures, and per-provider step selection.
- [ ] Docs state which checks are mock/dry-run and which require live staging credentials.

## Mandatory commands

- `pnpm exec vitest run tests/unit/provider-contract-smoke.test.ts`
- `pnpm smoke:staging -- --dry-run`
- `pnpm typecheck`
- `pnpm lint`

## Evidence required

- Dry-run smoke output summary.
- Test summary.
- Docs excerpt.

## Dependencies

phases 3, 6

