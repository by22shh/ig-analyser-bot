# Production Deployment Approval

This repository deploys to Fly from the `deploy` job in `.github/workflows/ci.yml`.

The job is bound to the GitHub Actions environment named `production`:

```yaml
environment:
  name: production
  url: https://ig-analyser-bot.fly.dev
```

## Required GitHub Repository Setting

Code can reference the environment, but only a repository admin can enforce environment protection rules in GitHub settings.

Before enabling automatic production deploys, configure:

- Environment: `production`
- Required reviewers: at least one release owner
- Deployment branches: `main` only
- Environment secrets:
  - `FLY_API_TOKEN`

Without these settings, the workflow still runs against the `production` environment name, but GitHub will not pause for approval.

## Release Gate

Approve the environment only after these checks are green for the exact revision:

1. `pnpm run ci`
2. `pnpm eval-golden`
3. `pnpm audit-economics:defaults`
4. `pnpm validate:recovery-runbooks`
5. `pnpm validate:alerts`
6. `pnpm smoke:staging -- --dry-run`
7. `pnpm smoke:mini-app-ui`
8. `pnpm eval:fly-checklist -- ig-analyser-bot`

After deploy, production readiness still requires the external Fly/live checks in `docs/operations/fly-live-eval.md`.
