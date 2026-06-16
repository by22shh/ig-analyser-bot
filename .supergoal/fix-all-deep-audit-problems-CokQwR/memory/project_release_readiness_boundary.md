---
name: project_release_readiness_boundary
description: Local green gates are not the same as Fly production readiness for this bot.
metadata:
  type: project
---

For this project, never claim Fly production parity from local gates alone. Local readiness requires `pnpm run ci`, golden eval, economics audit, runbook/alert validators and dry-run smoke. Fly production readiness additionally requires protected GitHub environment approval, deploy of the exact revision, Fly health/log checks, live provider smoke with staging credentials, live golden eval artifacts from the deployed runtime, restore drill evidence and real alert destination setup.

Use `docs/deployment/production-approval.md` and `docs/operations/fly-live-eval.md` as the release boundary.
