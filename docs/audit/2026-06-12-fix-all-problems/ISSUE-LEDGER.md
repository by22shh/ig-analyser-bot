# Issue Ledger: Fix All Deep Audit Problems

Дата: 2026-06-13 Asia/Novosibirsk  
Source audits: `FINAL-AUDIT.md`, `BEST-IN-CLASS-GAP-ANALYSIS.md`, phase reports under `docs/audit/2026-06-12-deep-product-audit/`.

Status legend:

- `planned` - assigned to a later phase in this run.
- `repo-fixable` - can be implemented or materially mitigated in this repository.
- `external-action-required` - needs a real deployment, provider credentials, legal review, or GitHub repository setting; this run must add gates/runbooks/checklists rather than pretending the external action is complete.

## P1 / launch blockers and proof gaps

| ID    | Issue                                                                             | Type                                    |  Phase | Verification method                                                                                            |
| ----- | --------------------------------------------------------------------------------- | --------------------------------------- | -----: | -------------------------------------------------------------------------------------------------------------- |
| P1-01 | `ECON_SUPPORT_RESERVE_RUB` documented/required but not counted in economics audit | repo-fixable                            |      2 | economics unit tests plus `pnpm audit-economics:defaults` with support reserve counted                         |
| P1-02 | No tested backup/restore/PITR runbook                                             | repo-fixable + external-action-required |      4 | recovery runbooks, validation script, restore-drill checklist; actual production drill remains operator action |
| P1-03 | No finance export/dashboard for reconciliation                                    | repo-fixable                            |      5 | finance export script, aggregation tests, finance runbook                                                      |
| P1-04 | No concrete alert thresholds/routing                                              | repo-fixable + external-action-required |      6 | structured alert config and validator; actual Sentry/OTEL dashboard setup remains operator action              |
| P1-05 | Current Fly production behind local evidence depth                                | external-action-required                | 10, 12 | deploy/eval checklist and final report; actual Fly deploy/live eval requires operator approval and credentials |
| P1-06 | Integration DB tests can be skipped locally; CI proof needs visibility            | repo-fixable                            |      3 | explicit CI integration DB gate and local DB test docs                                                         |
| P1-07 | No unified provider contract smoke pack                                           | repo-fixable + external-action-required |      7 | dry-run smoke runner and tests; live staging mode requires provider credentials                                |

## P2 / important product and ops improvements

| ID    | Issue                                                               | Type                                    | Phase | Verification method                                                              |
| ----- | ------------------------------------------------------------------- | --------------------------------------- | ----: | -------------------------------------------------------------------------------- |
| P2-01 | Postgres queue lacks documented operator playbook                   | repo-fixable                            |     4 | queue/payment triage runbook validation                                          |
| P2-02 | No live multi-process chaos proof for queue leases                  | repo-fixable + external-action-required |  3, 4 | CI DB proof plus operator/staging runbook; full chaos run remains staging action |
| P2-03 | Data deletion/retention needs end-to-end validation                 | repo-fixable                            |     9 | full delete-me privacy contract test                                             |
| P2-04 | Mini App RU copy has hardcoded English labels                       | repo-fixable                            |    11 | localization tests/smoke screenshots                                             |
| P2-05 | Mini App payment/API failure feedback is generic                    | repo-fixable                            | 8, 11 | payment failure taxonomy and Mini App state tests/screenshots                    |
| P2-06 | Visual smoke used mock data, not fuller app/test fixtures           | repo-fixable                            |    11 | visual smoke command and screenshots                                             |
| P2-07 | No real long-report visual regression                               | repo-fixable                            |    11 | long-report screenshot smoke                                                     |
| P2-08 | First-pass reports frequently require repair                        | repo-fixable                            |    10 | repair telemetry tests and alert config                                          |
| P2-09 | Low-evidence case close to content threshold                        | repo-fixable                            |    10 | low-evidence tests/fixtures and safer warning language                           |
| P2-10 | Raw model `[[SECTION]]` delimiters remain in research/raw artifacts | repo-fixable                            |    10 | user/admin surface tests that forbid delimiter leaks                             |
| P2-11 | Telegram webhook lacks explicit `allowed_updates`                   | repo-fixable                            |     8 | webhook setup tests                                                              |
| P2-12 | FaceCheck test mode uses local mock, not provider `demo` flag       | repo-fixable + external-action-required |     7 | smoke runner models mock/demo/live boundaries                                    |
| P2-13 | YooKassa IP allowlist freshness/runbook missing                     | repo-fixable + external-action-required |     8 | validation/runbook when YooKassa enabled                                         |
| P2-14 | YooKassa pending orders lack scheduled reconciliation poll          | repo-fixable                            |     8 | reconciliation service/script tests                                              |
| P2-15 | OSINT lawful basis not saved as durable audit artifact              | repo-fixable                            |     9 | audit metadata implementation/tests                                              |
| P2-16 | Admin grant/refund commands lack dedicated tests                    | repo-fixable                            |     9 | admin tests for non-admin, invalid inputs, caps, audit logs, idempotency         |
| P2-17 | Delete-me privacy contract only partially tested                    | repo-fixable                            |     9 | full integration/fake-storage delete-me test                                     |
| P2-18 | Cost anomaly detection missing                                      | repo-fixable                            | 6, 10 | alert config thresholds and repair/cost telemetry                                |
| P2-19 | Operator SQL snippets missing for queue/payment triage              | repo-fixable                            |     4 | runbook SQL validation                                                           |
| P2-20 | Photo-search margin skipped by feature flag                         | repo-fixable                            |  2, 7 | economics docs plus provider smoke feature-flag boundary                         |
| P2-21 | HR/photo/OSINT need policy/legal readiness before broad enablement  | repo-fixable + external-action-required | 9, 12 | policy docs and audit trail; legal approval remains external action              |

## P3 / hardening

| ID    | Issue                                                       | Type                                    | Phase | Verification method                                                 |
| ----- | ----------------------------------------------------------- | --------------------------------------- | ----: | ------------------------------------------------------------------- |
| P3-01 | Docker runtime runs as root                                 | repo-fixable                            |     9 | Dockerfile diff plus build/typecheck                                |
| P3-02 | Mini App CSP can be tightened                               | repo-fixable                            |     9 | CSP diff and Mini App auth/API tests                                |
| P3-03 | Dual queue driver support increases operational surface     | repo-fixable                            |  3, 4 | CI/tests or documented production-default decision                  |
| P3-04 | Deploy workflow lacks protected environment/manual approval | repo-fixable + external-action-required |    12 | workflow environment/doc update; actual GitHub setting external     |
| P3-05 | Telegram WebApp API warnings in standalone browser          | repo-fixable                            |    11 | version guards and smoke screenshots                                |
| P3-06 | Fly machine sizing needs production-like observation        | external-action-required                |    12 | load-test/runbook checklist; actual production observation external |
| P3-07 | Local `.env.production.local` exists and is ignored         | repo-fixable + external-action-required |    12 | secret-scan/checklist; file values must remain unread               |

## External actions that cannot be honestly completed by code alone

- Run an actual production/staging restore drill and record the result.
- Configure real alert destinations in Sentry/OTEL/log backend.
- Set GitHub protected environment/manual approval if repository settings require UI/API permission outside this workspace.
- Deploy current code to Fly and re-run live production eval.
- Run live provider smoke tests with real staging credentials.
- Complete legal/policy review for HR/OSINT/photo-search use cases before broad enablement.

## Resolution status after fix run

Status legend:

- `fixed` - repository change and automated/local evidence are complete.
- `mitigated` - repository gate/runbook/test exists, but a real operational drill or provider-backed run is still required.
- `external-action-required` - cannot be completed honestly from this workspace; exact operator action is documented.

| ID    | Status                               | Evidence / remaining action                                                                                                       |
| ----- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| P1-01 | fixed                                | Economics model/tests include support reserve; `pnpm audit-economics:defaults` is a required final gate.                          |
| P1-02 | mitigated + external-action-required | Recovery runbooks and `pnpm validate:recovery-runbooks` exist; actual PITR/restore drill must be run by operator.                 |
| P1-03 | fixed                                | Finance reconciliation module/CLI/runbook and unit coverage added.                                                                |
| P1-04 | mitigated + external-action-required | Alert config, routing docs and `pnpm validate:alerts` exist; real Sentry/OTEL destinations must be configured by operator.        |
| P1-05 | external-action-required             | Fly live eval checklist exists; current revision still needs approved Fly deploy and live eval run.                               |
| P1-06 | fixed                                | CI has PostgreSQL service, migration drift check and `pnpm test:integration:db`.                                                  |
| P1-07 | mitigated + external-action-required | `pnpm smoke:staging` dry-run is local/CI-safe; live staging smoke requires real credentials.                                      |
| P2-01 | fixed                                | Queue/payment triage runbook is validated.                                                                                        |
| P2-02 | mitigated + external-action-required | CI DB proof and queue runbook exist; live multi-process chaos remains staging action.                                             |
| P2-03 | fixed                                | Delete-me privacy integration contract covers PII, artifacts, payment payloads and credits.                                       |
| P2-04 | fixed                                | Mini App RU labels localized; visual smoke screenshots captured.                                                                  |
| P2-05 | fixed                                | Payment failure taxonomy plus Mini App payment/API state notices are implemented.                                                 |
| P2-06 | fixed                                | `pnpm smoke:mini-app-ui` runs local app fixtures at mobile/desktop widths.                                                        |
| P2-07 | fixed                                | Long-report Playwright screenshot is part of Mini App UI smoke.                                                                   |
| P2-08 | fixed                                | Report repair/quality telemetry and tests added.                                                                                  |
| P2-09 | fixed                                | Low-evidence fixtures, telemetry and safer warning language added.                                                                |
| P2-10 | fixed                                | `[[SECTION]]` markers stripped from user-facing report surfaces and tests.                                                        |
| P2-11 | fixed                                | Telegram webhook setup uses explicit `allowed_updates` with tests.                                                                |
| P2-12 | mitigated + external-action-required | Provider smoke models mock/demo/live boundary; real FaceCheck staging mode requires provider setup.                               |
| P2-13 | mitigated + external-action-required | YooKassa IP/runbook validation exists; operator must keep provider allowlist current when YooKassa is enabled.                    |
| P2-14 | fixed                                | YooKassa pending reconciliation service/script and tests added.                                                                   |
| P2-15 | fixed                                | OSINT lawful-basis audit metadata is written and tested.                                                                          |
| P2-16 | fixed                                | Admin grant/refund unit coverage added.                                                                                           |
| P2-17 | fixed                                | Delete-me privacy contract expanded with fake storage and finance payload checks.                                                 |
| P2-18 | fixed                                | Alert thresholds cover repair/cost anomaly signals; compact telemetry feeds usage events.                                         |
| P2-19 | fixed                                | Queue/payment operator SQL snippets are in validated runbooks.                                                                    |
| P2-20 | mitigated                            | Economics and provider smoke document/cap photo-search cost boundary while feature remains disabled by default.                   |
| P2-21 | mitigated + external-action-required | OSINT audit trail exists and risky modes remain feature-gated; legal/policy approval remains external.                            |
| P3-01 | fixed                                | Docker runtime uses non-root `node`, owned app/cache dirs and Playwright cache permissions.                                       |
| P3-02 | fixed                                | Mini App CSP is strict (`style-src 'self'`, no unsafe-inline, no remote `img-src`) and tested.                                    |
| P3-03 | mitigated                            | Production Fly config defaults to Postgres queue; BullMQ remains documented optional path.                                        |
| P3-04 | mitigated + external-action-required | Deploy workflow now references GitHub `production` environment; required reviewers/branch rules must be configured by repo admin. |
| P3-05 | fixed                                | Telegram WebApp optional API calls are version/method guarded and exercised by smoke stub.                                        |
| P3-06 | external-action-required             | Fly sizing/load observation requires production/staging traffic; final report documents this.                                     |
| P3-07 | mitigated + external-action-required | Secret scans/checklists are required; local ignored env values were not read and must remain operator-managed.                    |
