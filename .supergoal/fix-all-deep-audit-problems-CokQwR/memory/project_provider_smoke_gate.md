# Project Memory: Provider Smoke Gate

The project now has a staging provider smoke gate:

- `scripts/smoke/provider-contract-smoke.ts`
- package script `smoke:staging`
- runbook `docs/operations/provider-smoke.md`

Default execution is dry-run and safe: `pnpm smoke:staging -- --dry-run`. Live checks require `--live --staging` and validate required env before network/storage/browser work. Steps cover Telegram, YooKassa, OpenRouter, Apify, FaceCheck, S3 and PDF. Output is redacted for known credential env values and secret-shaped strings.
