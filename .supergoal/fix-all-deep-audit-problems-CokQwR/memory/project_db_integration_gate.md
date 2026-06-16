---
name: project_db_integration_gate
description: PostgreSQL integration tests are a named CI hard gate and may skip locally.
metadata:
  type: project
---

# DB Integration Gate Memory

`pnpm test:integration:db` now runs the credit, user/delete-me, and payment webhook integration suites. Locally, these tests can skip when a migrated PostgreSQL database is unavailable. In CI, `tests/integration/_db.ts` throws when `process.env.CI` is set and the database probe fails, so the same script is a hard gate after `pnpm prisma:migrate`.

Use `docs/development/db-integration-tests.md` for local Docker instructions. Treat local skip as weaker evidence, but not as a product failure when the CI gate is present.
