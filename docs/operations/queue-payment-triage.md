# Queue and Payment Triage Runbook

## Ownership

- Primary owner: backend on-call.
- Backup owner: product/ops lead.
- Applies to: Postgres queue jobs, runtime leases, credit reserves, Telegram Stars and YooKassa payments.

Run all SQL as read-only first. Any corrective `UPDATE` must be reviewed by the owner and recorded in an incident note.

## Stale Leases

Find stale leases:

```sql
SELECT name, holder_id, expires_at, updated_at
FROM runtime_leases
WHERE expires_at < NOW()
ORDER BY expires_at ASC;
```

Find jobs with stale queue locks:

```sql
SELECT id, status, queue_locked_by, queue_locked_until, queue_attempts_made, queue_max_attempts, created_at
FROM analysis_jobs
WHERE status NOT IN ('completed', 'failed')
  AND queue_locked_until < NOW()
ORDER BY queue_locked_until ASC
LIMIT 100;

SELECT id, status, queue_locked_by, queue_locked_until, queue_attempts_made, queue_max_attempts, created_at
FROM photo_search_jobs
WHERE status NOT IN ('completed', 'failed')
  AND queue_locked_until < NOW()
ORDER BY queue_locked_until ASC
LIMIT 100;
```

Expected operator action: let the worker retry loop reclaim the job, or restart the worker after confirming the old holder is gone.

## Stuck Jobs

Find old active jobs:

```sql
SELECT id, user_id, mode, status, stage, queue_attempts_made, queue_max_attempts, queue_next_run_at, updated_at
FROM analysis_jobs
WHERE status IN ('queued', 'retrying', 'fetching_profile', 'analyzing_images', 'generating_exports')
  AND updated_at < NOW() - INTERVAL '30 minutes'
ORDER BY updated_at ASC
LIMIT 100;
```

Find failed jobs:

```sql
SELECT id, user_id, mode, error_code, error_message, finished_at
FROM analysis_jobs
WHERE status = 'failed'
ORDER BY finished_at DESC
LIMIT 100;
```

Before manual changes, check whether reserves are still held.

## Credit Reserves

Find accounts with reserved units:

```sql
SELECT ca.user_id, ca.balance_units, ca.reserved_units, u.telegram_id
FROM credit_accounts ca
JOIN users u ON u.id = ca.user_id
WHERE ca.reserved_units > 0
ORDER BY ca.reserved_units DESC
LIMIT 100;
```

Find outstanding reserve transactions:

```sql
SELECT ct.id, ct.user_id, ct.analysis_job_id, ct.photo_search_job_id, ct.report_chat_message_id,
       ct.amount_units, ct.metadata, ct.created_at
FROM credit_transactions ct
WHERE ct.type = 'reserve'
  AND ct.created_at < NOW() - INTERVAL '30 minutes'
ORDER BY ct.created_at ASC
LIMIT 100;
```

Expected operator action: prefer application recovery (`src/jobs/recovery.ts`) over manual ledger edits. Manual reserve release must use application code or a reviewed transaction, not ad hoc balance math.

## Pending Payments

Find pending payments:

```sql
SELECT id, user_id, provider, provider_payment_id, amount_minor, currency, credits_units, expires_at, created_at
FROM payment_orders
WHERE status = 'pending_payment'
ORDER BY created_at ASC
LIMIT 100;
```

Find expired pending payments:

```sql
SELECT id, provider, provider_payment_id, expires_at
FROM payment_orders
WHERE status = 'pending_payment'
  AND expires_at < NOW()
ORDER BY expires_at ASC;
```

Expected operator action: run the pending-payment reconciliation job/script once it exists; until then, verify provider state before expiring or crediting any order.

## Duplicate Events

Find duplicate-looking provider objects:

```sql
SELECT provider, event_type, provider_object_id, COUNT(*) AS events
FROM payment_events
GROUP BY provider, event_type, provider_object_id
HAVING COUNT(*) > 1;
```

The database has a unique constraint on `(provider, event_type, provider_object_id)`, so this query should return no rows. If it returns rows after a migration or restore, stop payment processing and investigate uniqueness drift.

Find failed payment events:

```sql
SELECT id, provider, event_type, provider_object_id, payment_order_id, error_code, received_at
FROM payment_events
WHERE processing_status = 'failed'
ORDER BY received_at DESC
LIMIT 100;
```

## Escalation Stop Conditions

Escalate before manual writes when:

- A paid order is marked `paid` but no purchase credit transaction exists.
- A provider says a payment succeeded but metadata or amount does not match the order.
- Credit account totals are negative.
- Duplicate provider events appear despite the unique constraint.
- More than 10 active jobs are stale for over 30 minutes.
