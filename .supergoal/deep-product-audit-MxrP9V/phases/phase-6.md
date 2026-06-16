SUPERGOAL_PHASE_START
Phase: 6 of 8 - Audit Security Privacy
Task: Audit security, privacy, abuse resistance, secrets, and compliance boundaries.
Type: brownfield, audit, hardening, product-quality
Mandatory commands: pnpm exec vitest run tests/unit/consent-gate.test.ts tests/unit/subscription-gate.test.ts tests/unit/app-ip.test.ts tests/unit/update-dedup.test.ts tests/unit/telegram-rate-limit.test.ts tests/unit/mini-app-auth.test.ts tests/unit/grounding.test.ts tests/unit/usage-safe.test.ts, pnpm audit:prod, pnpm typecheck, pnpm lint
Acceptance criteria: 7
Evidence required: security checklist, secret-scan summary, abuse/privacy findings
Depends on phases: 1, 2, 3, 5

## Why

The product handles identity, payments, photos, public social data, and AI outputs; privacy and abuse boundaries must be explicit.

## Work

- Write `docs/audit/2026-06-12-deep-product-audit/05-security-privacy.md`.
- Review authorization/authentication, public-data boundaries, feature gates, consent, rate limits, secrets hygiene, SSRF protections, retention/deletion, and AI safety boundaries.
- Run a secret scan that reports paths and variable names only; never print secret values.
- Review prompt injection, unsafe inference, harassment/doxing/privacy-bypass refusal behavior, and grounding checks.
- Apply focused security/privacy fixes only when deterministic and testable.

## Acceptance criteria (all must pass - verify each in transcript)

- Public-data-only boundary, private-profile handling, HR/OSINT/photo-search feature gates, and consent gates have pass/fail/skipped rows with file references or test evidence.
- Mini App auth, Telegram webhook auth, admin authorization, subscription gate, rate limits, update deduplication, and chat/report access control have pass/fail/skipped rows with file references or test evidence.
- SSRF/image download protections, redirect handling, private IP blocking, file size limits, and timeout behavior are checked.
- Secrets hygiene is scanned across tracked and untracked files while avoiding printing secret values to the transcript.
- Prompt injection, instruction leak, unsafe inference, harassment/doxing/privacy-bypass refusal behavior, and grounding checks are reviewed.
- Data retention and deletion flows are checked against configured retention fields and user deletion behavior.
- Every P0/P1 security/privacy issue is fixed or documented with exploit path, impact, and blocking recommendation.

## Mandatory commands (run each, surface last ~10 lines + exit code)

- `pnpm exec vitest run tests/unit/consent-gate.test.ts tests/unit/subscription-gate.test.ts tests/unit/app-ip.test.ts tests/unit/update-dedup.test.ts tests/unit/telegram-rate-limit.test.ts tests/unit/mini-app-auth.test.ts tests/unit/grounding.test.ts tests/unit/usage-safe.test.ts`
- `pnpm audit:prod`
- `pnpm typecheck`
- `pnpm lint`

## Evidence required in transcript

- Security checklist table with pass/fail/skipped.
- Secret-scan summary without secret values.
- Abuse/privacy boundary findings with severity.

## Notes

Do not display any secret or credential value in the transcript or audit files.

---

The agent will, during execution, print SUPERGOAL_PHASE_START (above),
do the work, then print SUPERGOAL_PHASE_VERIFY, MEMORY_SAVED, and
SUPERGOAL_PHASE_DONE in order. On failure, the agent follows the
3-strike recovery protocol in .supergoal/deep-product-audit-MxrP9V/PROTOCOL.md without further
instruction needed here.
