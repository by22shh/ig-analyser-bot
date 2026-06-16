# Phase 9: Privacy admin hardening

Дата: 2026-06-13 Asia/Novosibirsk

## What changed

Added durable OSINT lawful-basis auditing, hardened privileged admin regression coverage, expanded the delete-me privacy contract, tightened the Mini App CSP and moved the Docker runtime to a non-root user without hiding Playwright Chromium under `/root`.

## Deliverables

- `src/modules/analysis/analysis.service.ts`
- `src/telegram/handlers/analyze.ts`
- `src/mini-app/routes.ts`
- `public/mini-app/app.js`
- `public/mini-app/styles.css`
- `Dockerfile`
- `tests/unit/admin.test.ts`
- `tests/unit/analysis-start.test.ts`
- `tests/unit/mini-app-api.test.ts`
- `tests/integration/users.service.test.ts`

## Audit-trail field excerpt

`osint_compliance` starts now create `audit_logs.action = osint_lawful_basis_accepted` on the `analysis_job` entity. The metadata includes:

```ts
metadata: {
  userId: input.userId,
  analysisJobId: job.id,
  mode: job.mode,
  source: input.source ?? "analysis_service",
  requestId: input.requestId ?? null,
  timestamp: timestamp.toISOString(),
  lawfulBasisVersion: input.lawfulBasisVersion ?? OSINT_LAWFUL_BASIS_VERSION,
  lawfulBasisAccepted: true,
  jobCreatedAt: job.createdAt.toISOString()
}
```

The write is inside the new-job transaction and is idempotency-aware for reused jobs.

## Security coverage

| Area         | Coverage                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| OSINT audit  | Unit tests assert durable metadata and no duplicate audit rows for reused idempotency keys                                                |
| Admin grant  | Non-admin no-op, invalid input/max cap, audit success and audit failure resilience                                                        |
| Admin refund | Invalid order id, idempotent already-processed refund metadata, failed refund audit                                                       |
| Delete-me    | Fake storage deletion, report/artifact removal, payment events, Stars/YooKassa raw payloads, fiscal receipts, user PII and credit zeroing |
| Mini App CSP | No `unsafe-inline`, no inline style attributes, `img-src` narrowed to `self data:`                                                        |

## CSP and Docker diff summary

- Mini App JS no longer emits inline `style="width:..."`; progress bars use bounded width classes.
- CSP is now:

```text
default-src 'self'; base-uri 'none'; object-src 'none'; script-src 'self' https://telegram.org; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors https://web.telegram.org https://telegram.org https://*.telegram.org
```

- Docker runner sets `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`, copies runtime files with `--chown=node:node`, prepares `.data` and cache directories, keeps Chromium readable and runs `USER node`.

## Validation

Command logs are under `docs/audit/2026-06-12-fix-all-problems/commands/phase-9/`.

| Command                                                                                                                                                                                |                                       Exit | Log                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------------------------------------: | -------------------- | --------------------- |
| `pnpm exec vitest run tests/unit/admin.test.ts tests/unit/consent-gate.test.ts tests/unit/mini-app-auth.test.ts tests/integration/users.service.test.ts tests/unit/usage-safe.test.ts` |                                          0 | `security-tests.log` |
| `pnpm build`                                                                                                                                                                           |                                          0 | `build.log`          |
| `pnpm typecheck`                                                                                                                                                                       |                                          0 | `typecheck.log`      |
| `pnpm lint`                                                                                                                                                                            |                                          0 | `lint.log`           |
| `rg -n "unsafe-inline                                                                                                                                                                  | style=\"" public/mini-app src/mini-app -S` | 0                    | `csp-inline-scan.log` |

Local note: `tests/integration/users.service.test.ts` skipped because no migrated local Postgres was reachable; the CI database gate added in phase 3 runs it against PostgreSQL.
