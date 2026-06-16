---
name: project_prisma_validate_env
description: Prisma validation in this repo requires DATABASE_URL and DIRECT_URL.
metadata:
  type: project
---

# Prisma Validate Env Memory

In this repository, plain `pnpm exec prisma validate` fails in a shell that lacks `DIRECT_URL`, because `prisma/schema.prisma` defines `directUrl = env("DIRECT_URL")`. The schema itself validates successfully with safe test values for `DATABASE_URL` and `DIRECT_URL`.

Future phases should either run Prisma validation with explicit safe test URLs or add a package/helper script that supplies them. Treat a raw validate failure caused only by missing `DIRECT_URL` as environment-only, not a schema defect.

