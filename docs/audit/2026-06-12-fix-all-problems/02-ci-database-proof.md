# Phase 3: CI database proof

Дата: 2026-06-13 Asia/Novosibirsk

## What changed

PostgreSQL integration tests are now a named CI gate instead of being implicit inside the full Vitest run. The new `test:integration:db` package script runs credit ledger, user/delete-me and payment webhook integration tests against PostgreSQL.

## Files touched

- `package.json`
- `.github/workflows/ci.yml`
- `docs/development/db-integration-tests.md`

## CI behavior

The CI workflow now runs:

1. `pnpm prisma:migrate`
2. migration drift check with `prisma migrate diff`
3. `pnpm test:integration:db`
4. `pnpm run ci`

`tests/integration/_db.ts` already fails in CI when the DB is unreachable or unmigrated, so this step is a hard gate. Locally, the same tests may skip when no database is reachable; that local skip is explicitly documented as weaker evidence.

## Verification

Command logs are under `docs/audit/2026-06-12-fix-all-problems/commands/phase-3/`.

| Command                                                                                                  | Exit | Result                                                                                        |
| -------------------------------------------------------------------------------------------------------- | ---: | --------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run tests/integration/credits.service.test.ts tests/integration/users.service.test.ts` |    0 | local skip: 2 files skipped, 9 tests skipped because local DB was unavailable outside CI      |
| env-qualified `pnpm exec prisma validate`                                                                |    0 | schema valid                                                                                  |
| `pnpm typecheck`                                                                                         |    0 | pass                                                                                          |
| `pnpm lint`                                                                                              |    0 | pass                                                                                          |
| `pnpm test:integration:db`                                                                               |    0 | local skip: 3 files skipped, 19 tests skipped; same script is a hard CI gate after migrations |

The local runbook is `docs/development/db-integration-tests.md`.

## Local skip classification

The local integration commands skipped because the current shell did not have a reachable migrated PostgreSQL database. This does not weaken the CI gate: GitHub Actions provisions PostgreSQL, runs `pnpm prisma:migrate`, then runs `pnpm test:integration:db`; `tests/integration/_db.ts` throws when `process.env.CI` is set and the DB probe fails.
