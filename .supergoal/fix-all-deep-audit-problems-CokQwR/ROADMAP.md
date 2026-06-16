# Roadmap: Fix All Deep Audit Problems

**Task:** Исправить все проблемы и улучшения, найденные deep product audit.
**Type:** brownfield, hardening, product-quality, ops, security, ui
**Created:** 2026-06-12
**Total phases:** 12

## Context summary

- **Stack:** TypeScript, Node >=20, Fastify, grammy, Prisma/PostgreSQL, Telegram Mini App, OpenRouter, Apify, FaceCheck, YooKassa, Fly/Neon.
- **Package manager:** pnpm 10.32.1.
- **Build / test / lint commands:** `pnpm run ci`, targeted `vitest`, `pnpm eval-golden`, Prisma validate/migrate diff, new smoke/audit scripts created by the run.
- **Risky areas:** money ledger and margins, provider contracts, external-webhook recovery, admin/privacy flows, Mini App payment UX, deployment and operations proof.

## Assumptions

- The existing dirty worktree is user-owned baseline and must not be reverted.
- All repo-addressable problems should be fixed with code, tests, scripts, CI, docs, or runbooks.
- Real external credentials, live deploys, legal review, and GitHub environment protection settings cannot be fabricated; the repository must add explicit gates/runbooks for them.
- Public paid launch is considered blocked until P1 phases pass and the final audit says so.
- YooKassa, FaceCheck, HR, OSINT and photo-search may remain feature-flagged, but their enablement paths must be testable and documented.

## Risk top 3

1. **Money fixes can regress credit/payment semantics** - likelihood: high, mitigation: economics unit tests, finance export tests, final `pnpm run ci`.
2. **Ops work can become docs-only theater** - likelihood: medium, mitigation: runbooks plus scripts/templates/checks wherever possible.
3. **UI and provider smoke work can overreach into live secrets** - likelihood: medium, mitigation: default dry-run/mock modes and explicit live-mode guards.

## Phase map

| #   | Phase                    | Depends on | Deliverable                                                                 |
| --- | ------------------------ | ---------- | --------------------------------------------------------------------------- |
| 1   | Safety Net Baseline      | -          | Current-state proof, issue ledger, and command baseline                     |
| 2   | Economics Truth          | 1          | Support reserve semantics fixed in economics model/tests/docs              |
| 3   | CI Database Proof        | 1, 2       | Mandatory PostgreSQL integration proof and migration-drift visibility       |
| 4   | Recovery Runbooks        | 1, 2, 3    | Backup/restore/PITR/rollback/queue/payment recovery runbooks and snippets  |
| 5   | Finance Reconciliation   | 2, 3       | Reconciliation export and cost/liability checks                            |
| 6   | Alerts Observability     | 2, 3, 5    | Alert thresholds, routing docs, validation script, workflow artifact        |
| 7   | Provider Smoke Gate      | 3, 6       | Unified staging smoke pack for providers/storage/PDF                       |
| 8   | Payment Webhook Recovery | 2, 5, 7    | Telegram allowed updates and YooKassa pending/allowlist recovery hardening  |
| 9   | Privacy Admin Hardening  | 3, 8       | OSINT audit trail, admin tests, delete-me contract, CSP/Docker hardening    |
| 10  | Report Quality Telemetry | 2, 6, 9    | Repair-rate telemetry, low-evidence fixtures, raw-output leak protection    |
| 11  | Mini App UX Polish       | 8, 10      | RU localization, payment failure states, visual regression smoke            |
| 12  | Deployment Final Harden  | 1..11      | Deployment protection docs, final CI/eval/smoke audit, resolved gap report  |

---

## Phase 1 - Safety Net Baseline

**Why:** Before wide fixes, capture a clean baseline and turn the audit list into a machine-checkable issue ledger.

**Deliverables:**
- `docs/audit/2026-06-12-fix-all-problems/00-fix-baseline.md`
- `docs/audit/2026-06-12-fix-all-problems/ISSUE-LEDGER.md`
- `docs/audit/2026-06-12-fix-all-problems/commands/phase-1/`

**Acceptance criteria:**
- [ ] Baseline report records HEAD, branch, dirty/untracked files, package scripts, tool versions, and previous audit artifact paths.
- [ ] Issue ledger maps every P1/P2/P3 problem from the audit to a planned phase and expected verification method.
- [ ] Existing tests and commands are run once and all failures are classified before code changes.
- [ ] No user-owned pre-existing changes are reverted.
- [ ] The ledger explicitly separates repo-fixable work from external operator actions.

**Mandatory commands:**
- `pnpm run ci`
- `pnpm eval-golden`
- `pnpm exec prisma validate`

**Evidence required:**
- Command summary table with exit codes.
- Issue ledger excerpt.
- `git status --short` and `git diff --stat` excerpts.

**Dependencies:** none

---

## Phase 2 - Economics Truth

**Why:** Paid public launch is impossible while support reserve is required but not counted in economics.

**Deliverables:**
- Updated economics model and audit script.
- Updated economics tests.
- Updated `docs/financial-model.md` and `.env.example` semantics.
- `docs/audit/2026-06-12-fix-all-problems/01-economics-truth.md`

**Acceptance criteria:**
- [ ] `ECON_SUPPORT_RESERVE_RUB` semantics are unambiguous: included vs additive is documented in code, env docs, and financial docs.
- [ ] If additive, `audit-economics` includes support reserve in Standard cost and fails old underpriced defaults.
- [ ] Default pricing/env values are updated so `pnpm audit-economics:defaults` passes with support reserve counted.
- [ ] Unit tests cover additive support reserve, included-support mode if retained, and required-units math.
- [ ] The final economics report shows Standard, chat and influencer margins after the fix.

**Mandatory commands:**
- `pnpm exec vitest run tests/unit/economics.test.ts tests/unit/payment-package-visibility.test.ts`
- `pnpm audit-economics:defaults`
- `pnpm typecheck`
- `pnpm lint`

**Evidence required:**
- Diff summary for economics files.
- Test output summary.
- Economics output table.

**Dependencies:** phase 1

---

## Phase 3 - CI Database Proof

**Why:** Money and ledger invariants need real PostgreSQL proof, not only unit tests and skipped local integration tests.

**Deliverables:**
- CI workflow updates for explicit integration DB reporting.
- Optional local helper script for DB integration checks.
- `docs/audit/2026-06-12-fix-all-problems/02-ci-database-proof.md`

**Acceptance criteria:**
- [ ] Integration DB tests for credits/users/payment invariants are mandatory in CI and not hidden inside skipped suites.
- [ ] CI publishes or prints an explicit integration-test summary.
- [ ] Migration drift check remains present and documented.
- [ ] Local command docs explain how to run the same DB tests with `docker-compose`.
- [ ] If tests skip locally due missing DB, CI still has a hard gate and the local skip is explicitly classified.

**Mandatory commands:**
- `pnpm exec vitest run tests/integration/credits.service.test.ts tests/integration/users.service.test.ts`
- `pnpm exec prisma validate`
- `pnpm typecheck`
- `pnpm lint`

**Evidence required:**
- Workflow diff excerpt.
- Integration test output or skip classification with CI gate evidence.
- Local run instructions.

**Dependencies:** phases 1, 2

---

## Phase 4 - Recovery Runbooks

**Why:** Backup/restore, rollback, queue recovery and payment recovery must be operationally executable before paid launch.

**Deliverables:**
- `docs/operations/backup-restore-pitr.md`
- `docs/operations/migration-rollback.md`
- `docs/operations/queue-payment-triage.md`
- `scripts/ops/validate-recovery-runbooks.ts`
- `docs/audit/2026-06-12-fix-all-problems/03-recovery-runbooks.md`

**Acceptance criteria:**
- [ ] Backup/restore/PITR runbook includes RPO/RTO, owner, Neon export/PITR steps, restore drill cadence, and validation SQL.
- [ ] Migration rollback runbook covers Fly release rollback, DB migration rollback decision tree, and stop conditions.
- [ ] Queue/payment triage doc includes SQL snippets for stale leases, stuck jobs, failed jobs, pending payments, reserves, and duplicate events.
- [ ] Validation script checks required sections/snippets exist and exits non-zero when required runbook content is missing.
- [ ] Package scripts expose the runbook validation.

**Mandatory commands:**
- `pnpm exec tsx scripts/ops/validate-recovery-runbooks.ts`
- `pnpm typecheck`
- `pnpm lint`

**Evidence required:**
- Runbook file listing.
- Validation script output.
- Key snippets excerpt.

**Dependencies:** phases 1, 2, 3

---

## Phase 5 - Finance Reconciliation

**Why:** A paid product needs verifiable reconciliation across payments, credits, refunds, liabilities and provider costs.

**Deliverables:**
- `scripts/finance/export-reconciliation.ts`
- Tests for reconciliation aggregation.
- `docs/operations/finance-reconciliation.md`
- `docs/audit/2026-06-12-fix-all-problems/04-finance-reconciliation.md`

**Acceptance criteria:**
- [ ] Export script supports date range, JSON and CSV/TSV output, and safe redaction of user/payment raw payloads.
- [ ] Export includes gross payments, provider channel, refunds, credits sold, credits consumed, outstanding liability, failed events, and provider cost estimates.
- [ ] Tests cover aggregation, redaction, empty range, refunds, and provider-cost estimation.
- [ ] Finance runbook explains weekly reconciliation and launch go/no-go checks.
- [ ] Cost anomaly thresholds are derived from the economics model or documented configuration.

**Mandatory commands:**
- `pnpm exec vitest run tests/unit/finance-reconciliation.test.ts tests/unit/economics.test.ts`
- `pnpm exec tsx scripts/finance/export-reconciliation.ts --help`
- `pnpm typecheck`
- `pnpm lint`

**Evidence required:**
- Export command sample.
- Test summary.
- Runbook excerpt.

**Dependencies:** phases 2, 3

---

## Phase 6 - Alerts Observability

**Why:** Provider failures, queues, payments, retention and cost spikes must alert before users discover the outage.

**Deliverables:**
- `config/alerts/production-alerts.yml` or equivalent structured alert config.
- `scripts/ops/validate-alerts.ts`
- `docs/operations/alerts-routing.md`
- Workflow/package-script integration.
- `docs/audit/2026-06-12-fix-all-problems/05-alerts-observability.md`

**Acceptance criteria:**
- [ ] Alert config defines thresholds, severity, owner/routing, runbook link, and signal source for provider auth/credits errors, payment failures, queue backlog/stale locks, repeated analysis failures, S3/PDF failures, retention failures, repair-rate spikes, and usage-cost spikes.
- [ ] Validation script fails when any required alert lacks threshold, owner or runbook link.
- [ ] Observability docs explain Sentry/OTEL/log-based implementation and local/staging smoke.
- [ ] CI or `pnpm run ci` invokes alert validation directly or through a new audit script.
- [ ] No alert examples contain real secrets or production tokens.

**Mandatory commands:**
- `pnpm exec tsx scripts/ops/validate-alerts.ts`
- `pnpm typecheck`
- `pnpm lint`

**Evidence required:**
- Alert config excerpt.
- Validation output.
- Package/workflow diff summary.

**Dependencies:** phases 2, 3, 5

---

## Phase 7 - Provider Smoke Gate

**Why:** Integration confidence must move from scattered tests to one repeatable staging contract gate.

**Deliverables:**
- `scripts/smoke/provider-contract-smoke.ts`
- Provider smoke tests.
- `docs/operations/provider-smoke.md`
- Package script such as `smoke:staging`.
- `docs/audit/2026-06-12-fix-all-problems/06-provider-smoke-gate.md`

**Acceptance criteria:**
- [ ] Smoke runner has safe default dry-run mode and explicit live/staging opt-in.
- [ ] It covers Telegram webhook config, YooKassa test webhook/payment metadata, OpenRouter structured/fallback, Apify actor/dataset, FaceCheck demo/mock/prod mode boundary, S3 signed URL, and PDF render dependency.
- [ ] Live mode refuses to run if required env vars are absent and never prints secret values.
- [ ] Tests cover dry-run output, missing-secret failures, and per-provider step selection.
- [ ] Docs state which checks are mock/dry-run and which require live staging credentials.

**Mandatory commands:**
- `pnpm exec vitest run tests/unit/provider-contract-smoke.test.ts`
- `pnpm smoke:staging -- --dry-run`
- `pnpm typecheck`
- `pnpm lint`

**Evidence required:**
- Dry-run smoke output summary.
- Test summary.
- Docs excerpt.

**Dependencies:** phases 3, 6

---

## Phase 8 - Payment Webhook Recovery

**Why:** Telegram update drift and YooKassa webhook loss are rare but expensive paid-flow failure modes.

**Deliverables:**
- Explicit Telegram `allowed_updates` configuration.
- YooKassa pending-order reconciliation job or script.
- YooKassa IP allowlist freshness/runbook check.
- Tests for payment recovery paths.
- `docs/audit/2026-06-12-fix-all-problems/07-payment-webhook-recovery.md`

**Acceptance criteria:**
- [ ] Telegram webhook setup sends an explicit `allowed_updates` allowlist and tests assert it.
- [ ] YooKassa pending payments can be reconciled by scheduled job or operator script without double-crediting.
- [ ] Reconciliation tests cover succeeded, canceled, pending, amount mismatch, metadata mismatch, duplicate event and missing provider object.
- [ ] YooKassa IP allowlist/runbook freshness is validated when YooKassa feature flag is enabled.
- [ ] Payment failure taxonomy is available for Mini App phase to show clearer states.

**Mandatory commands:**
- `pnpm exec vitest run tests/unit/telegram-webhook.test.ts tests/unit/yookassa-adapter.test.ts tests/unit/payment-reconciliation.test.ts tests/unit/mini-app-api.test.ts`
- `pnpm typecheck`
- `pnpm lint`

**Evidence required:**
- Test output summary.
- Diff excerpt for webhook/reconciliation paths.
- Recovery command/runbook excerpt.

**Dependencies:** phases 2, 5, 7

---

## Phase 9 - Privacy Admin Hardening

**Why:** Security gates are strong, but best-in-class requires auditability and regression tests for powerful operations.

**Deliverables:**
- OSINT lawful-basis audit trail implementation and tests.
- Dedicated admin grant/refund tests.
- Full delete-me privacy contract tests.
- CSP hardening and Docker non-root runtime.
- `docs/audit/2026-06-12-fix-all-problems/08-privacy-admin-hardening.md`

**Acceptance criteria:**
- [ ] Starting `osint_compliance` writes durable audit metadata: userId, report/job id where available, mode, source, requestId, timestamp, lawfulBasisVersion.
- [ ] Admin grant/refund tests cover non-admin no-op, invalid inputs, max grant cap, auditLog success/failure, refund idempotency.
- [ ] Delete-me test covers fake storage, report artifacts, payment rows, raw/payload fields, user PII and credit balances.
- [ ] Mini App CSP removes or narrows `unsafe-inline` where feasible and restricts `img-src` to necessary domains.
- [ ] Docker runtime uses a non-root user while preserving Playwright/PDF functionality.

**Mandatory commands:**
- `pnpm exec vitest run tests/unit/admin.test.ts tests/unit/consent-gate.test.ts tests/unit/mini-app-auth.test.ts tests/integration/users.service.test.ts tests/unit/usage-safe.test.ts`
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`

**Evidence required:**
- Security test output.
- CSP/Docker diff summary.
- Audit-trail field excerpt.

**Dependencies:** phases 3, 8

---

## Phase 10 - Report Quality Telemetry

**Why:** Report quality is the paid value; repair behavior and low-evidence cases must be observable and guarded.

**Deliverables:**
- Repair-rate / failed-quality telemetry.
- Low-evidence golden fixtures or focused tests.
- Raw-output delimiter leak protections.
- Fly parity/deploy eval checklist.
- `docs/audit/2026-06-12-fix-all-problems/09-report-quality-telemetry.md`

**Acceptance criteria:**
- [ ] Analysis pipeline records repair attempts, repair success/failure, failed_quality and low-evidence flags in usage/report telemetry without exposing prompts.
- [ ] Tests cover first-pass repair metrics and failed-quality metrics.
- [ ] Low-evidence/large-profile fixtures assert prominent warnings and safe confidence language.
- [ ] Raw `[[SECTION]]` markers cannot reach user-facing report/chat/admin export surfaces.
- [ ] Docs/script describe deploy then Fly live eval before making production quality claims.

**Mandatory commands:**
- `pnpm exec vitest run tests/unit/report-builder.test.ts tests/unit/report-quality.test.ts tests/unit/content-quality.test.ts tests/unit/analysis-context.test.ts tests/unit/grounding.test.ts`
- `pnpm eval-golden`
- `pnpm typecheck`
- `pnpm lint`

**Evidence required:**
- Golden eval summary.
- Metrics/test summary.
- Diff excerpt for telemetry fields.

**Dependencies:** phases 2, 6, 9

---

## Phase 11 - Mini App UX Polish

**Why:** The user-facing paid path must feel finished in RU/EN, especially payment failure and long-report states.

**Deliverables:**
- RU/EN localization cleanup for Mini App labels.
- Explicit payment/API failure states.
- Telegram WebApp version guards.
- Long-report and payment-state visual smoke screenshots.
- `docs/audit/2026-06-12-fix-all-problems/10-mini-app-ux-polish.md`

**Acceptance criteria:**
- [ ] RU mode no longer shows hardcoded English labels for credit/followers/posts/AI chat/payment labels.
- [ ] Mini App distinguishes invoice opened, pending, failed, unavailable, email required, retryable API failure, unauthorized and empty states.
- [ ] Telegram WebApp browser warnings are avoided by version guards or test-safe fallbacks.
- [ ] Visual smoke runs against local app/test fixtures, including mobile and desktop widths, long report, payment error and empty reports.
- [ ] Screenshots are saved and reviewed for text overflow/overlap.

**Mandatory commands:**
- `pnpm exec vitest run tests/unit/mini-app-api.test.ts tests/unit/mini-app-auth.test.ts tests/snapshots/messages.test.ts`
- `pnpm typecheck`
- `pnpm lint`
- UI smoke command added by this phase, if feasible

**Evidence required:**
- Screenshot paths.
- Test summary.
- Copy/localization diff summary.

**Dependencies:** phases 8, 10

---

## Phase 12 - Deployment Final Harden

**Why:** The last phase proves the repository can honestly move from fixed gaps to a launch-ready claim.

**Deliverables:**
- Protected deployment/environment docs or workflow updates.
- Final resolved-gap report.
- Final command logs.
- Updated audit docs under `docs/audit/2026-06-12-fix-all-problems/FINAL-FIX-REPORT.md`

**Acceptance criteria:**
- [ ] Deployment workflow either uses a protected environment/manual approval or documents the required GitHub environment protection that cannot be set from code.
- [ ] All P1/P2/P3 issues from `ISSUE-LEDGER.md` are marked fixed, mitigated with evidence, or explicitly external-action-required.
- [ ] Full `pnpm run ci` passes.
- [ ] `pnpm eval-golden`, `pnpm audit-economics:defaults`, runbook validation, alert validation, and smoke dry-run all pass.
- [ ] Final diff review finds no stray debug output, session TODO/FIXME, real secrets, unrelated reverts or temporary files.
- [ ] Final report distinguishes local repo readiness from Fly production readiness and states exactly what external operator steps remain.

**Mandatory commands:**
- `pnpm run ci`
- `pnpm eval-golden`
- `pnpm audit-economics:defaults`
- all new validation/smoke scripts added by earlier phases

**Evidence required:**
- Final command summary.
- Resolved issue ledger summary.
- Final `git diff --stat`.
- Secret/cleanliness scan summary.

**Dependencies:** phases 1 through 11

