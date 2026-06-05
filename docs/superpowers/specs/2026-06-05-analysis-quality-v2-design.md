# Analysis Quality v2 — Design (model swap + grounding + prompts v3)

Date: 2026-06-05
Status: approved (user greenlit "сразу реализуй"); implementing via TDD.
Evidence base: `docs/research/2026-06-05-bakeoff/FINDINGS.md` (GPT-5.5 vs Claude 4.8 vs Gemini bake-off).
Extends: `docs/superpowers/specs/2026-06-05-analysis-quality-design.md` (this is the measured subset + corrections).

## Decisions (from brainstorm)

| #   | Decision             | Choice                                                                                                                                                                                                                                                                                                             |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Reasoning model      | Change **code default** `MODEL_REASONING` → `openai/gpt-5.5`; document A/B (claude-opus-4.8 / gemini-2.5-pro) in `.env.example`. Driver = safety (Gemini infers relationships).                                                                                                                                    |
| 2   | Grounding            | Deterministic **always-on** (source validation + forbidden-inference) **+** optional LLM pass behind `LLM_GROUNDING_CHECK` (default on) on `MODEL_GROUNDING` (default = flash).                                                                                                                                    |
| 3   | Budgets/latency      | Balanced: output 4096→8000, input 24k→90k chars, `LLM_REQUEST_TIMEOUT_MS` default 180000, `MODEL_REASONING_EFFORT`=medium, repair only on real grounding/section failures.                                                                                                                                         |
| 4   | Provider portability | **Correction:** Claude rejects `response_format` wholesale (not a `minItems/maxItems` issue — GPT-5.5 accepts the schemas as-is). Fix = harden the fallback predicate so any non-supporting provider degrades to text `[[SECTION]]` cleanly + make the text format instruction reliable. Do NOT churn the schemas. |

## Workstreams

### A. Model + budgets + timeout + temperature fix

- `env.ts`: `MODEL_REASONING` default → `openai/gpt-5.5`; new `MODEL_REASONING_EFFORT` (enum low|medium|high, default medium), `MODEL_GROUNDING` (default `google/gemini-2.5-flash`), `LLM_GROUNDING_CHECK` (bool, default true), `LLM_REQUEST_TIMEOUT_MS` (default 180000); raise `LLM_FINAL_OUTPUT_TOKEN_BUDGET` default 4096→8000 and `LLM_FINAL_INPUT_TOKEN_BUDGET` 24000→90000.
- `openrouter.adapter.ts`: thread `reasoning.effort` from env into generate/repair; use `LLM_REQUEST_TIMEOUT_MS` in `chatCompletion`; **drop `temperature` on the reasoning + repair calls** (GPT-5.5 is a reasoning model and rejects `temperature≠1`). Vision/chat keep their temperatures.
- `.env.example`: document all new vars + A/B model block.

### B. Structured-output fallback hardening

- Extend `canFallbackFromStructuredError` to also treat "provider does not support response_format" responses (Claude via OpenRouter → `OPENROUTER_404`/`OPENROUTER_400`/empty + provider-error body) as fallback-eligible, so structured → text `[[SECTION]]` degradation is clean for non-supporting models. GPT-5.5/Gemini keep structured.

### C. Grounding — new `src/modules/llm/grounding.ts`

- `validateEvidenceSources(sections|structured, sourceCatalog)` → list of evidence postIds/urls absent from the catalog (fabrication). Free, deterministic.
- `detectForbiddenInferences(sections)` → RU/EN keyword+pattern scan for claims asserted as fact about: relationships/marriage/partner, identity, employment/income/wealth, health, political/religious/sexual attributes. Returns flagged {section, snippet}. Heuristic, labeled.
- Optional `verifyGrounding(...)` behind `LLM_GROUNDING_CHECK`: one cheap-model call returning per-section unsupported/forbidden flags. Degrades gracefully on error.
- Works on parsed `ReportSectionView[]` (model-agnostic: structured or text path).
- `report-builder.ts`: run grounding after parse; extend `reportIssueScore` with invalidSources + forbidden + unsupported counts; repair triggers if missing sections OR weak sources OR grounding flags; repair system text gains "remove/down-confidence flagged claims; drop fabricated sources".

### D. Prompts v3 + section guides

- `vision.detail.v3`: demand verbatim transcription of all visible text; flag screenshot/repost framing; name recurring brand/logo + scene type. Schema gains `textVerbatim: string[]`, `isLikelyScreenshot: boolean`; renderer updated.
- `report.{standard,influencer,hr,osint_compliance}.v3`: prepend a **HARD RULES** block (never infer relationships/identity/employment/health/wealth/political/religious/sexual; never coach the user to assert unverified claims; third parties in photos off-limits); require confidence tied to sample size (`analyzedPosts` vs `postsCount`); use `goal` prominently; reliable `[[SECTION]]` fallback format.
- New `src/prompts/section-guides.ts`: one-line guide per `standard` required section; threaded into the report context as `sectionGuides` (keeps system prompts lean).
- Bump prompt keys to `*.v3`.

### E. Tests + CI

- New: `grounding.test.ts` (fabrication flagged, forbidden phrases flagged, safe phrases pass, score wiring), fallback-predicate test, section-guide injection test, vision v3 schema/render test.
- Update: any test asserting prompt versions/keys; snapshots if needed.
- Gate: existing suite stays green; `pnpm ci` (prisma generate, lint, format:check, typecheck, test, audit-economics) green.

## Out of scope (YAGNI; remain in the broader spec)

- Claude native tool-calling structured path (text fallback suffices for the ALT).
- Goal wizard collection, carousel-vision images, chat-context enrichment.
- Section guides for influencer/hr/osint (standard first).
- Removing `minItems/maxItems` from schemas.

## Risks

- Prompt-key bump may break version-asserting tests/snapshots → update them.
- GPT-5.5 latency ~85 s + repair → covered by 180 s timeout + conditional repair.
- Forbidden-inference heuristic = false pos/neg → labeled heuristic; LLM pass backs it up; both only _raise_ repair, never hard-block delivery.
