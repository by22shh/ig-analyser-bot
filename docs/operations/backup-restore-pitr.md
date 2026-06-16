# Backup, Restore and PITR Runbook

## Ownership

- Primary owner: on-call engineer for the bot backend.
- Backup owner: product/ops lead.
- Scope: Neon PostgreSQL data for users, credits, payments, reports, jobs, audit logs and runtime leases.
- RPO target: 15 minutes for paid production data, bounded by Neon PITR/export availability.
- RTO target: 60 minutes for a standard restore into a new Neon branch and Fly cutover decision.
- Restore drill cadence: quarterly, plus before any broad paid public launch.

## What Is Protected

- Credit ledger: `credit_accounts`, `credit_transactions`.
- Payment ledger: `payment_orders`, `payment_events`, `telegram_star_payments`, `yookassa_payments`, `payment_refunds`, `fiscal_receipts`.
- Product data: `analysis_jobs`, `photo_search_jobs`, `reports`, `report_artifacts`.
- Compliance data: `audit_logs`, `telegram_updates`.

Object storage for generated artifacts is handled by the storage provider lifecycle policy. Database restore does not guarantee S3 object recovery, so report artifact validation must include storage key checks.

## Scheduled Backup Checks

1. Confirm Neon PITR is enabled for the production project.
2. Confirm daily logical export is configured or manually runnable.
3. Confirm Fly app secrets contain both pooled `DATABASE_URL` and direct `DIRECT_URL`.
4. Confirm latest migration version is known before deploy.
5. Record the backup check in the operations log.

## Neon PITR Restore Drill

1. Pick a restore timestamp at least 15 minutes in the past.
2. Create a restored Neon branch/database from PITR.
3. Set temporary local env variables to the restored branch:

```bash
export DATABASE_URL="postgresql://restored-pooler.example/db?sslmode=require"
export DIRECT_URL="postgresql://restored-direct.example/db?sslmode=require"
```

4. Validate schema and migration state:

```bash
pnpm exec prisma validate
pnpm exec prisma migrate status
```

5. Run read-only validation SQL below.
6. If the restore is for production recovery, pause workers before cutover, then update Fly secrets only after validation passes.

## Logical Export

Use logical export before high-risk migrations or provider/payment changes:

```bash
pg_dump "$DIRECT_URL" --format=custom --no-owner --file "backup-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Store the dump in the approved encrypted backup location. Never attach dumps to tickets or chat.

## Validation SQL

Run these on the restored branch before any cutover:

```sql
SELECT COUNT(*) AS users_total FROM users;
SELECT COUNT(*) AS credit_accounts_total FROM credit_accounts;
SELECT COALESCE(SUM(balance_units), 0) AS balance_units,
       COALESCE(SUM(reserved_units), 0) AS reserved_units
FROM credit_accounts;

SELECT status, COUNT(*) AS orders
FROM payment_orders
GROUP BY status
ORDER BY status;

SELECT processing_status, COUNT(*) AS events
FROM payment_events
GROUP BY processing_status
ORDER BY processing_status;

SELECT status, COUNT(*) AS analysis_jobs
FROM analysis_jobs
GROUP BY status
ORDER BY status;

SELECT COUNT(*) AS reports_with_artifacts
FROM report_artifacts
WHERE storage_key IS NOT NULL;
```

Expected result: counts should be plausible for the selected restore timestamp; no unexplained drop in users, credit accounts, payment orders or reports.

## Cutover Stop Conditions

Stop the restore and escalate if any of these are true:

- Migration status does not match the target application release.
- Credit totals differ from the pre-incident snapshot without a known reason.
- Payment orders exist without matching provider rows after the selected timestamp.
- Required Fly secrets are unavailable.
- Restore validation SQL cannot complete.

## After Restore

1. Run `pnpm test:integration:db` against the restored branch if safe.
2. Restart web and worker processes.
3. Watch payment, queue, provider and retention alerts for 60 minutes.
4. Document RPO/RTO actually achieved.
