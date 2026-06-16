# Provider contract smoke

Owner: engineering release operator.

Script: `pnpm smoke:staging`

Default mode: dry-run. No network, storage or browser calls are made unless `--live --staging` is passed.

## Dry-run

```bash
pnpm smoke:staging -- --dry-run
pnpm smoke:staging -- --dry-run --step telegram,openrouter,s3
```

Dry-run verifies the smoke plan, selected steps and required live environment variables. It is safe for local development and CI logs.

## Live staging mode

```bash
pnpm smoke:staging -- --live --staging
pnpm smoke:staging -- --live --staging --step yookassa
```

Live mode refuses to run a provider step until required environment variables are present. Output is redacted for known credential variables and common secret-shaped strings.

## Step coverage

| Step         | Dry-run behavior                                    | Live staging behavior                                                                                                  |
| ------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `telegram`   | Plans webhook URL and secret-token checks.          | Calls `getWebhookInfo` and verifies HTTPS webhook config without mutating webhook settings.                            |
| `yookassa`   | Plans a 1 RUB test payment and metadata round-trip. | Requires test mode, creates a staging test payment with smoke metadata and verifies metadata response.                 |
| `openrouter` | Plans structured JSON request and fallback path.    | Sends a tiny structured request; if structured output is rejected, retries a text fallback request.                    |
| `apify`      | Plans actor metadata and dataset checks.            | Reads `apify~instagram-scraper` metadata and one item from `APIFY_SMOKE_DATASET_ID` without starting a paid actor run. |
| `facecheck`  | Plans demo/mock/prod mode boundary checks.          | Passes in `FACECHECK_TESTING_MODE=true`; otherwise requires a real token when photo search is enabled.                 |
| `s3`         | Plans signed URL construction.                      | Generates a 60-second presigned GET URL for `smoke/provider-contract.txt` without uploading data.                      |
| `pdf`        | Plans Chromium render dependency check.             | Launches Playwright Chromium and renders a minimal PDF buffer.                                                         |

## Required live environment

- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_WEBHOOK_SECRET`.
- YooKassa: `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_RETURN_URL`, `YOOKASSA_API_BASE_URL`, `YOOKASSA_TEST_MODE=true`.
- OpenRouter: `OPENROUTER_API_KEY`.
- Apify: `APIFY_TOKEN`, `APIFY_SMOKE_DATASET_ID`.
- FaceCheck: `FACECHECK_TESTING_MODE=true`, or `FEATURE_PHOTO_SEARCH=true` plus `FACECHECK_API_TOKEN` for real-mode staging.
- S3: `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; optional `S3_ENDPOINT`, `S3_REGION`.
- PDF: Playwright Chromium installed in the runtime image.

## Release usage

1. Run dry-run locally and in release notes.
2. Run live staging after deploying a staging image and before promoting paid traffic.
3. Run a targeted step after rotating a single provider credential.
4. Store the output with the release checklist. Redacted output is safe to paste into an incident or release note.
