# Migration Rollback Runbook

## Ownership

- Primary owner: engineer performing the deploy.
- Approver: product/ops lead for paid production.
- Applies to: Prisma migrations, Fly releases and Neon database changes.

## Decision Tree

1. Did the migration run in production?
   - No: stop deploy, fix locally, rerun CI.
   - Yes: continue.
2. Is the failure app-code only with schema still backward compatible?
   - Yes: use Fly release rollback.
   - No: continue.
3. Did the migration destructively drop or rewrite paid data?
   - Yes: stop condition, use PITR restore decision with backup owner.
   - No: write a forward-fix migration when it is safer than PITR.
4. Are payments or credit ledger writes still arriving?
   - Yes: pause workers/webhooks before database restore or manual repair.

## Fly Release Rollback

Inspect releases:

```bash
fly releases --app ig-analyser-bot
```

Rollback app code when the database remains compatible:

```bash
fly deploy --remote-only --config fly.toml --app ig-analyser-bot --image <previous-image>
```

If using Fly's release rollback command in your environment, record the exact command and release id in the incident log.

## Prisma Migration Checks

Before rollback or forward-fix:

```bash
pnpm exec prisma migrate status
pnpm exec prisma validate
```

Check deployed migration rows:

```sql
SELECT migration_name, started_at, finished_at, rolled_back_at
FROM _prisma_migrations
ORDER BY started_at DESC
LIMIT 10;
```

## Validation SQL

Use these after rollback or forward-fix:

```sql
SELECT status, COUNT(*) FROM payment_orders GROUP BY status ORDER BY status;
SELECT processing_status, COUNT(*) FROM payment_events GROUP BY processing_status ORDER BY processing_status;
SELECT COUNT(*) FROM credit_accounts WHERE balance_units < 0 OR reserved_units < 0;
SELECT COUNT(*) FROM analysis_jobs WHERE status IN ('queued', 'retrying', 'fetching_profile', 'analyzing_images', 'generating_exports');
```

Expected result: no negative credit accounts; payment/event counts should be explainable; active jobs should either continue or be triaged.

## Stop Conditions

Stop automated rollback and escalate when:

- The failed migration may have removed or corrupted credit/payment data.
- Prisma migration history is inconsistent or partially applied.
- App code and schema cannot be made backward compatible quickly.
- Webhooks are actively granting credits while the database is being restored.
- Validation SQL shows negative credit balances or unexplained payment/event mismatches.

## Required Incident Notes

Record:

- Release id before and after rollback.
- Migration name and checksum if relevant.
- RPO/RTO impact.
- Whether workers/webhooks were paused.
- Validation SQL results.
