# Roadmap: Deep Product Audit

**Task:** Run a maximally deep audit of the existing Instagram Analyzer Telegram Bot and determine whether it is correct, well thought through, and best-in-class.
**Type:** brownfield, audit, hardening, product-quality
**Created:** 2026-06-12
**Total phases:** 8

## Context summary

- **Stack:** TypeScript, Node >=20, Fastify, grammy, Prisma/PostgreSQL, BullMQ or Postgres queue, Telegram Mini App, OpenRouter, Apify, FaceCheck, YooKassa, Fly/Neon.
- **Package manager:** pnpm 10.32.1.
- **Build / test / lint commands:** `pnpm prisma:generate`, `pnpm audit:prod`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm audit-economics:defaults`, `pnpm run ci`.
- **Risky areas:** LLM report quality, external provider contracts, payments/credits idempotency, Telegram/Mini App UX, worker retries, privacy/compliance, pricing economics, Fly deployment parity.

## Assumptions

Non-blocking decisions recorded here so we can proceed without round-trips. If any are wrong, stop the run and tell us:

- Audit scope is the whole current product, including local uncommitted worktree changes.
- Low-risk deterministic fixes may be applied during the audit when they are proven by tests; large strategic/product changes should be documented as prioritized findings instead of silently rewritten.
- Live provider checks are optional because secrets may be unavailable; mock, unit, golden, and existing production eval artifacts remain mandatory.
- The final verdict must answer: production-grade now, best-in-class now, and what blocks either claim.

## Risk top 3

1. **LLM quality looks structured but is not actually useful enough for paid users** - likelihood: high, mitigation: golden evals, source coverage, delivery gate checks, prompt-leak scans, and comparison to existing Fly/local eval reports.
2. **Payment/credit/provider edge cases duplicate charges or lose credits under retries** - likelihood: medium, mitigation: idempotency-focused tests and a provider-contract audit against Telegram/YooKassa docs.
3. **Operational readiness lags behind code quality** - likelihood: medium, mitigation: dedicated audit of Fly config, CI, migrations, observability, cost guardrails, retention, runbooks, and final hardening.

## Phase map

| # | Phase | Depends on | Deliverable |
|---|-------|------------|-------------|
| 1 | Establish Baseline | none | Baseline audit folder, command results, current-state inventory |
| 2 | Review Architecture | 1 | Architecture, data, queue, transaction, and invariant audit |
| 3 | Audit User Journeys | 1, 2 | Telegram and Mini App journey audit with screenshots/smoke evidence |
| 4 | Audit Analysis Quality | 1, 2 | LLM/report/evidence/golden-eval audit |
| 5 | Audit Integrations | 1, 2, 4 | External provider and failure-mode audit |
| 6 | Audit Security Privacy | 1, 2, 3, 5 | Security, privacy, compliance, abuse, and secrets audit |
| 7 | Audit Economics Ops | 1, 2, 5, 6 | Pricing, cost, deployment, CI, observability, and runbook audit |
| 8 | Polish & Harden | 1..7 | Final fixes, final CI, best-in-class verdict, and prioritized gap report |

---

## Phase 1 - Establish Baseline

**Why:** The audit needs a trustworthy baseline before classifying defects or claiming product quality.

**Deliverables:**
- `docs/audit/2026-06-12-deep-product-audit/00-baseline.md`
- `docs/audit/2026-06-12-deep-product-audit/commands/`

**Acceptance criteria:**
- [ ] `00-baseline.md` exists and includes HEAD SHA, branch, dirty/untracked files, Node version, pnpm version, package scripts, and provider mode assumptions.
- [ ] Every mandatory command is run once, with exit code and last relevant output saved under `commands/` and summarized in `00-baseline.md`.
- [ ] Any failing command is classified as pre-existing, environment-only, or introduced-by-audit with evidence.
- [ ] `pnpm audit:prod` result is included with severity summary.
- [ ] Current local worktree changes are explicitly listed as user-owned baseline changes and are not reverted.
- [ ] The baseline report distinguishes local code state from current Fly production state using existing eval docs when present.

**Mandatory commands:**
- `pnpm prisma:generate`
- `pnpm audit:prod`
- `pnpm lint`
- `pnpm format:check`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`
- `pnpm audit-economics:defaults`

**Evidence required:**
- Command summary table with exit codes.
- `git status --short` and `git diff --stat` excerpts.
- Baseline report path and file size.

**Dependencies:** none

---

## Phase 2 - Review Architecture

**Why:** A product cannot be "best" if its data model, queues, transactions, and module boundaries are brittle.

**Deliverables:**
- `docs/audit/2026-06-12-deep-product-audit/01-architecture-data-invariants.md`
- Any low-risk characterization tests or fixes required to prove invariants.

**Acceptance criteria:**
- [ ] The report maps key modules: Telegram handlers, Mini App routes, analysis pipeline, LLM adapter, payments, credits, jobs, reports, storage, and provider adapters.
- [ ] Prisma schema and migrations are checked for referential integrity, cascade behavior, idempotency keys, indexes, retention fields, and drift risk.
- [ ] Queue behavior has a pass/fail/skipped table for lease safety, retry semantics, duplicate work prevention, and worker shutdown behavior, with file references or test evidence for each row.
- [ ] Credit ledger and payment transaction boundaries are checked for reserve/capture/release correctness.
- [ ] Environment validation and production assertions are checked against deployment expectations.
- [ ] Any discovered P0/P1 invariant defect is either fixed with a focused test or documented with exact file/line evidence and impact.

**Mandatory commands:**
- `DATABASE_URL=postgresql://ig_analyser:ig_analyser@localhost:5432/ig_analyser_bot DIRECT_URL=postgresql://ig_analyser:ig_analyser@localhost:5432/ig_analyser_bot pnpm exec prisma validate`
- `pnpm exec vitest run tests/unit/retry.test.ts tests/unit/postgres-workers.test.ts tests/unit/worker-lease-guard.test.ts tests/unit/credits-release.test.ts tests/unit/user-service-race.test.ts tests/integration/credits.service.test.ts`
- `pnpm typecheck`
- `pnpm lint`

**Evidence required:**
- Architecture risk table with severity and affected files.
- Targeted test output summary.
- Any patch summary for low-risk fixes.

**Dependencies:** phase 1

---

## Phase 3 - Audit User Journeys

**Why:** Technical correctness is not enough; the bot and Mini App must feel complete across real user paths and failure states.

**Deliverables:**
- `docs/audit/2026-06-12-deep-product-audit/02-user-journeys.md`
- `docs/audit/2026-06-12-deep-product-audit/screenshots/`

**Acceptance criteria:**
- [ ] Telegram flows are audited for `/start`, menu, analyze, photo search consent, report history, report chat, credits, payments, settings, cancellation/reset, and admin boundaries.
- [ ] RU and EN locale surfaces are sampled and checked for broken placeholders, unsafe HTML, confusing copy, and missing states.
- [ ] Mini App routes are smoke-tested in local/mock mode at mobile and desktop viewport widths, with screenshots saved.
- [ ] Empty, loading, error, unauthorized, payment pending/success/failure, and long-content states are explicitly reviewed.
- [ ] Snapshot tests and targeted Telegram/Mini App tests pass or failures are classified with evidence.
- [ ] Any UX blocker that prevents a normal user from completing the paid analysis path is fixed or marked P0 in the report.

**Mandatory commands:**
- `pnpm exec vitest run tests/unit/telegram-webhook.test.ts tests/unit/analysis-start.test.ts tests/unit/analysis-keyboard.test.ts tests/unit/payments-keyboard.test.ts tests/unit/mini-app-api.test.ts tests/unit/mini-app-auth.test.ts tests/snapshots/messages.test.ts`
- `pnpm typecheck`
- `pnpm lint`

**Evidence required:**
- Screenshots list with viewport sizes.
- Journey checklist table with pass/fail/skipped and reasons.
- Targeted test output summary.

**Dependencies:** phases 1, 2

---

## Phase 4 - Audit Analysis Quality

**Why:** The analysis report is the core paid value; structure, grounding, source coverage, and practical usefulness must be tested directly.

**Deliverables:**
- `docs/audit/2026-06-12-deep-product-audit/03-analysis-quality.md`
- `docs/audit/2026-06-12-deep-product-audit/analysis-quality-metrics.json`

**Acceptance criteria:**
- [ ] The report checks required section coverage, parsed section count, source coverage, `deliveryHealth`, practical detail, low-evidence behavior, and prompt/instruction leak resistance.
- [ ] Existing eval artifacts under `docs/research/` are compared against current local behavior, including local vs Fly production divergence.
- [ ] Golden eval output is saved and summarized with pass/fail metrics.
- [ ] User-facing report text is scanned for internal rubric, schema, prompt, and repair/gate leakage.
- [ ] Structured output fallback and parse failure behavior are verified through tests.
- [ ] Any deterministic report-quality bug is fixed with a focused unit test; any subjective quality gap is recorded as a prioritized product gap.

**Mandatory commands:**
- `pnpm eval-golden`
- `pnpm exec vitest run tests/unit/report-builder.test.ts tests/unit/report-quality.test.ts tests/unit/content-quality.test.ts tests/unit/analysis-context.test.ts tests/unit/structured-output.test.ts tests/unit/grounding.test.ts tests/unit/openrouter-empty.test.ts tests/unit/practical-requirements.test.ts`
- `pnpm typecheck`
- `pnpm lint`

**Evidence required:**
- Golden eval summary.
- Metrics JSON path and key metrics.
- Prompt-leak grep summary.
- Before/after evidence for any quality fix.

**Dependencies:** phases 1, 2

---

## Phase 5 - Audit Integrations

**Why:** The product depends on external contracts; adapter correctness, idempotency, retries, and failure classification decide real reliability.

**Deliverables:**
- `docs/audit/2026-06-12-deep-product-audit/04-integrations-failures.md`

**Acceptance criteria:**
- [ ] Telegram webhook handling has pass/fail/skipped rows against current Bot API expectations, including secret token, update deduplication, allowed update assumptions, and long-polling/webhook mode separation.
- [ ] Mini App initData validation has pass/fail/skipped rows against Telegram HMAC/auth_date requirements.
- [ ] YooKassa payment/refund creation and webhook reconciliation have pass/fail/skipped rows for `Idempotence-Key` uniqueness, <=64 character behavior, duplicate event safety, and status lifecycle handling.
- [ ] OpenRouter requests have pass/fail/skipped rows for structured outputs, model/provider fallback, timeouts, empty responses, and response validation.
- [ ] Apify profile ingestion has pass/fail/skipped rows for actor lifecycle, 401/402/timeout failures, dataset mapping, identity mismatch, private/not-found profiles, and result limits.
- [ ] FaceCheck, S3/local storage, PDF, and provider mock/real mode switches have pass/fail/skipped rows for safe fallback behavior.
- [ ] All integration findings include severity, affected files, reproducibility, and whether a fix was applied.

**Mandatory commands:**
- `pnpm exec vitest run tests/unit/apify-map.test.ts tests/unit/yookassa-adapter.test.ts tests/unit/invoice-payload.test.ts tests/unit/payment-package-visibility.test.ts tests/unit/photo-search-idempotency.test.ts tests/unit/facecheck.test.ts tests/unit/llm-request.test.ts tests/unit/openrouter-empty.test.ts tests/unit/telegram-rate-limit.test.ts`
- `pnpm audit:prod`
- `pnpm typecheck`
- `pnpm lint`

**Evidence required:**
- Provider contract checklist with official-doc references.
- Targeted test output summary.
- Failure-mode matrix by provider.

**Dependencies:** phases 1, 2, 4

---

## Phase 6 - Audit Security Privacy

**Why:** The product handles identity, payments, photos, public social data, and AI outputs; privacy and abuse boundaries must be explicit.

**Deliverables:**
- `docs/audit/2026-06-12-deep-product-audit/05-security-privacy.md`

**Acceptance criteria:**
- [ ] Public-data-only boundary, private-profile handling, HR/OSINT/photo-search feature gates, and consent gates have pass/fail/skipped rows with file references or test evidence.
- [ ] Mini App auth, Telegram webhook auth, admin authorization, subscription gate, rate limits, update deduplication, and chat/report access control have pass/fail/skipped rows with file references or test evidence.
- [ ] SSRF/image download protections, redirect handling, private IP blocking, file size limits, and timeout behavior are checked.
- [ ] Secrets hygiene is scanned across tracked and untracked files while avoiding printing secret values to the transcript.
- [ ] Prompt injection, instruction leak, unsafe inference, harassment/doxing/privacy-bypass refusal behavior, and grounding checks are reviewed.
- [ ] Data retention and deletion flows are checked against configured retention fields and user deletion behavior.
- [ ] Every P0/P1 security/privacy issue is fixed or documented with exploit path, impact, and blocking recommendation.

**Mandatory commands:**
- `pnpm exec vitest run tests/unit/consent-gate.test.ts tests/unit/subscription-gate.test.ts tests/unit/app-ip.test.ts tests/unit/update-dedup.test.ts tests/unit/telegram-rate-limit.test.ts tests/unit/mini-app-auth.test.ts tests/unit/grounding.test.ts tests/unit/usage-safe.test.ts`
- `pnpm audit:prod`
- `pnpm typecheck`
- `pnpm lint`

**Evidence required:**
- Security checklist table with pass/fail/skipped.
- Secret-scan summary without secret values.
- Abuse/privacy boundary findings with severity.

**Dependencies:** phases 1, 2, 3, 5

---

## Phase 7 - Audit Economics Ops

**Why:** A best product must be economically viable and operable after deploy, not merely correct locally.

**Deliverables:**
- `docs/audit/2026-06-12-deep-product-audit/06-economics-ops.md`

**Acceptance criteria:**
- [ ] Pricing packages, public package visibility, provider cost assumptions, Stars/YooKassa reserves, support reserve, and report/chat/photo-search margins are checked.
- [ ] `pnpm audit-economics:defaults` passes or produces a documented economics blocker.
- [ ] Fly config, Dockerfile, CI workflow, release command, process groups, env requirements, and migration drift strategy have pass/fail/skipped rows with file references.
- [ ] Observability coverage has pass/fail/skipped rows for structured logs, Sentry, OpenTelemetry, usage events, payment/job/report audit logs, and alerting gaps.
- [ ] Backup/restore, migration rollback, queue recovery, failed job recovery, stuck payment recovery, and provider outage runbooks are assessed.
- [ ] The report lists launch blockers separately from later improvements.

**Mandatory commands:**
- `pnpm audit-economics:defaults`
- `pnpm exec vitest run tests/unit/economics.test.ts tests/unit/payment-package-visibility.test.ts tests/unit/background-leader.test.ts tests/unit/job-recovery.test.ts tests/unit/retention.service.test.ts`
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`

**Evidence required:**
- Economics output summary.
- Ops readiness checklist.
- Launch-blocker table.

**Dependencies:** phases 1, 2, 5, 6

---

## Phase 8 - Polish & Harden

**Why:** The final phase rechecks everything together and turns the audit into a clear product verdict.

**Deliverables:**
- `docs/audit/2026-06-12-deep-product-audit/FINAL-AUDIT.md`
- `docs/audit/2026-06-12-deep-product-audit/BEST-IN-CLASS-GAP-ANALYSIS.md`

**Acceptance criteria:**
- [ ] All prior audit reports exist and their P0/P1 findings are either fixed, downgraded with evidence, or listed as launch blockers.
- [ ] The final report gives explicit answers for: "Is everything good?", "Are there errors?", "Is everything thought through?", and "Can this be called the best product?"
- [ ] The final report separates local repository readiness from currently deployed Fly production readiness.
- [ ] Full CI-equivalent command succeeds, or every failure is classified with exact cause and blocking status.
- [ ] Final `git diff --stat` is reviewed for accidental debug output, temporary files, prompt leaks, TODO/FIXME added by this run, and unrelated churn.
- [ ] `BEST-IN-CLASS-GAP-ANALYSIS.md` contains a ranked gap list with severity, user impact, business impact, fix size, and recommended next action.
- [ ] No audit artifact prints secrets or private credential values.

**Mandatory commands:**
- `pnpm run ci`
- `pnpm eval-golden`
- `pnpm audit-economics:defaults`

**Evidence required:**
- Final CI/eval/economics summaries.
- Final verdict excerpt.
- Final audit artifact listing.
- Final `git diff --stat` summary.

**Dependencies:** phases 1, 2, 3, 4, 5, 6, 7
