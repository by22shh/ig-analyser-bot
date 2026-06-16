import { existsSync, readFileSync } from "node:fs";

type RequiredCheck = {
  label: string;
  pattern: RegExp;
};

type RunbookSpec = {
  path: string;
  checks: RequiredCheck[];
};

const specs: RunbookSpec[] = [
  {
    path: "docs/operations/backup-restore-pitr.md",
    checks: [
      { label: "RPO", pattern: /\bRPO\b/i },
      { label: "RTO", pattern: /\bRTO\b/i },
      { label: "owner", pattern: /owner/i },
      { label: "Neon PITR", pattern: /Neon[\s\S]*PITR|PITR[\s\S]*Neon/i },
      { label: "export", pattern: /export/i },
      { label: "restore drill cadence", pattern: /restore drill|quarterly/i },
      {
        label: "validation SQL",
        pattern: /```sql[\s\S]*(credit_accounts|payment_orders|analysis_jobs)/i
      }
    ]
  },
  {
    path: "docs/operations/migration-rollback.md",
    checks: [
      { label: "Fly release rollback", pattern: /fly releases|fly deploy|flyctl/i },
      { label: "DB decision tree", pattern: /decision tree/i },
      { label: "stop conditions", pattern: /stop condition/i },
      { label: "Prisma migrations", pattern: /prisma migrate|migrations/i },
      {
        label: "validation SQL",
        pattern: /```sql[\s\S]*(schema_migrations|_prisma_migrations|payment_orders)/i
      }
    ]
  },
  {
    path: "docs/operations/queue-payment-triage.md",
    checks: [
      { label: "stale leases", pattern: /stale leases|queue_locked_until/i },
      { label: "stuck jobs", pattern: /stuck jobs|analysis_jobs|photo_search_jobs/i },
      { label: "failed jobs", pattern: /failed jobs|status = 'failed'/i },
      { label: "pending payments", pattern: /pending payments|pending_payment/i },
      { label: "reserves", pattern: /reserved_units|credit_transactions/i },
      { label: "duplicate events", pattern: /duplicate events|payment_events/i },
      { label: "SQL snippets", pattern: /```sql[\s\S]*SELECT[\s\S]*```/i }
    ]
  }
];

const failures: string[] = [];

for (const spec of specs) {
  if (!existsSync(spec.path)) {
    failures.push(`${spec.path}: file missing`);
    continue;
  }
  const content = readFileSync(spec.path, "utf8");
  for (const check of spec.checks) {
    if (!check.pattern.test(content)) {
      failures.push(`${spec.path}: missing ${check.label}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log(`Recovery runbooks validated: ${specs.map((spec) => spec.path).join(", ")}`);
