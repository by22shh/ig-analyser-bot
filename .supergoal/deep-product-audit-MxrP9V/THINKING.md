# Deep Thinking - Product Audit

## Goals

- Determine whether `ig-analyser-telegram-bot` is objectively healthy enough to call production-grade and best-in-class for its current niche.
- Convert broad questions ("is everything good?", "any errors?", "best product?") into falsifiable checks across code, product UX, LLM quality, integrations, security, privacy, economics, and operations.
- Produce durable audit artifacts under `docs/audit/2026-06-12-deep-product-audit/` and apply only low-risk, well-tested fixes discovered during the audit.
- Preserve existing user work in the dirty worktree; do not revert or overwrite unrelated changes.

## Constraints

- Brownfield repository with 26 changed/untracked files before this Supergoal started.
- The local worktree appears to include analysis-quality improvements that are not yet deployed to Fly, so the audit must distinguish local code quality from current production behavior.
- External live provider checks may depend on secrets. When secrets are unavailable, the executor must run mock/local/golden checks and clearly mark live-only checks as skipped with reason.
- Slash commands must be dispatched by the user after plan confirmation; this planning run only prepares the `/goal` chain.

## Risks

1. LLM/report quality may pass structure tests while still being weak for paid users. Mitigation: run golden evals, source-coverage checks, prompt-leak scans, content-quality tests, and compare local artifacts to existing Fly eval docs.
2. Money and idempotency paths can look fine in unit tests but fail under duplicate webhooks, retries, or provider edge cases. Mitigation: targeted tests around credits, payment events, YooKassa idempotence, Telegram Stars payloads, and webhook replay behavior.
3. Product can be technically correct but not "best" because UX, privacy posture, operational runbooks, or observability are incomplete. Mitigation: dedicated user journey, security/privacy, and economics/ops phases, followed by a final best-in-class gap report.

## Non-obvious Dependencies

- Baseline and command health must run first; otherwise later phase failures cannot be classified as pre-existing vs introduced.
- User journey audit depends on understanding bot/Mini App routes and auth, but can run before deeper provider checks because mock mode exists.
- LLM quality audit should happen before the final verdict because it is the core value proposition.
- Security/privacy depends on the external integrations inventory, but Mini App initData and Telegram webhook security can be checked independently.
- The final "best product" verdict must be based on all earlier evidence, not a subjective summary.

## Open Questions Assumed

- Scope is the entire current product: Telegram bot, Mini App, backend, workers, providers, payments, deployment, docs, tests, and audit/eval artifacts.
- The audit may make small deterministic fixes with tests; larger product changes become prioritized findings rather than surprise rewrites.
- Production secrets are not assumed available. Live checks are optional evidence, not mandatory success gates unless the environment already has the credentials.
- "Best" means best-in-class readiness for the current niche and scope, not absolute perfection or dominance over all possible competitors.

## Memory Hits Applied

- None.

## Tools/Skills Relied On

- Supergoal protocol for phase slicing, recovery, and final audit.
- Browser skill for localhost Mini App visual checks when the executor starts a local server.
- Web search/fetch for current official docs on Telegram, Telegram Mini Apps, YooKassa, OpenRouter, and Apify.

## Best Practices Applied

- Telegram webhook audit includes `secret_token`/`X-Telegram-Bot-Api-Secret-Token`, update idempotency, and long-polling/webhook exclusivity.
- Telegram Mini App audit includes initData HMAC validation and auth_date freshness.
- YooKassa audit includes `Idempotence-Key` uniqueness and <=64 character handling.
- OpenRouter audit includes strict JSON schema structured outputs, fallback behavior, error handling, and response validation.
- Apify audit includes actor run lifecycle, timeout/retry classification, API-token security, and dataset/result mapping resilience.
- Security audit includes public-data-only boundaries, prompt-injection/output-leak prevention, SSRF controls for image downloads, rate limits, and secrets hygiene.

