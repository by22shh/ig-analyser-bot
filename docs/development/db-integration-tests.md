# PostgreSQL integration tests

These tests prove credit, payment and delete/reactivation invariants against a real PostgreSQL database. They are a hard CI gate and a local confidence tool before payment or ledger changes.

## What CI runs

GitHub Actions provisions PostgreSQL, runs `pnpm prisma:migrate`, checks migration drift, then runs:

```bash
pnpm test:integration:db
```

The script currently covers:

- `tests/integration/credits.service.test.ts`
- `tests/integration/users.service.test.ts`
- `tests/integration/payments.webhook.test.ts`

If the CI database is missing or unmigrated, `tests/integration/_db.ts` throws and the job fails. Integration DB tests are therefore not hidden inside the general test suite.

## Local run

Start local dependencies:

```bash
docker compose up -d postgres redis
```

Run migrations:

```bash
DATABASE_URL=postgresql://ig_analyser:ig_analyser@localhost:5432/ig_analyser_bot \
DIRECT_URL=postgresql://ig_analyser:ig_analyser@localhost:5432/ig_analyser_bot \
pnpm prisma:migrate
```

Run the integration suite:

```bash
DATABASE_URL=postgresql://ig_analyser:ig_analyser@localhost:5432/ig_analyser_bot \
DIRECT_URL=postgresql://ig_analyser:ig_analyser@localhost:5432/ig_analyser_bot \
pnpm test:integration:db
```

If no local database is reachable, the tests skip outside CI so `pnpm test` remains usable for quick development. Treat a local skip as weaker evidence: before merging money/ledger changes, run the command against Docker or rely on the CI hard gate.

## Migration drift proof

The CI job keeps this drift check before integration tests:

```bash
pnpm exec prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

An empty diff exits `0`; a non-empty diff exits non-zero and blocks the workflow.
