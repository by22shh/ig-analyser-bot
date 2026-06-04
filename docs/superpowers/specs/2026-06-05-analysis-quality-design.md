# Analysis Quality Improvements — Design

Date: 2026-06-05
Branch: `feat/analysis-quality`
Status: approved (brainstorm), pending spec review

## 1. Context

The profile-analysis pipeline is:

`username → Apify (≤30 posts) → per-image Vision (gemini-2.5-flash) → deterministic metrics → one reasoning call (gemini-2.5-pro, structured JSON) → section parse → repair (missing sections / weak sources) → persist + deliver → report chat (gemini-2.5-flash over report prose)`.

The architecture is robust (structured outputs, repair loop, budgeted context, idempotency, privacy guardrails). The limiting factor is **signal depth and task-fit**, not reliability. Key gaps found during review:

- `goal` is plumbed end-to-end (`analysis.service` → DB → worker → report context) but **never collected** in the wizard (`analyze.ts`), so it is always `undefined`. For `standard` (a "how do I approach this person" tool) this leaves every report generic.
- Report prompts have **no per-section guidance**; 17 loaded Russian section titles + one dense system paragraph force the model to guess intent.
- The "input token budget" is actually a **24000-character cap** that aggressively truncates captions/comments (the raw evidence), while gemini-2.5-pro has ~1M context.
- Metrics are **raw, not benchmarked/interpreted**; the model has no anchors for "audience quality" verdicts.
- Vision sees **only the carousel cover** (`childPosts` kept as IDs only); comments capped at 5/post; reels not labeled as video.
- Repair only triggers on missing sections / missing source attribution — **a confident wrong claim with a plausible URL passes**.
- Chat gets **report prose only** (no metrics / post catalog), so it cannot answer data questions even though the data exists.

## 2. Decisions (from brainstorming)

| Decision                    | Choice                                                                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                       | **All** improvements, one effort; per-report cost increase accepted                                                                                        |
| Goal collection             | **Optional** wizard step for `standard` (with "Skip" button)                                                                                               |
| Reasoning model             | Raise `reasoning.effort` + output budget on current model first; make model swap a single env + ready A/B. **Default model unchanged** pending measurement |
| Tagged-feed (2nd Apify run) | **Deferred**, behind `FEATURE_FETCH_TAGGED` (default off)                                                                                                  |
| LLM grounding pass          | **Enabled**, behind `LLM_GROUNDING_CHECK` (default on)                                                                                                     |

## 3. Approach

**Feature-engineering-first** (push signal into deterministic, testable computed features + prompt rubrics + larger context) **+ a verify/grounding pass** (from multi-pass) **+ larger budget and an optional stronger model** (model-first). This maximises accuracy per unit of cost/risk and keeps most gains under unit-test coverage.

## 4. Workstreams

### A. Data layer (Apify)

- Capture carousel slide images: extend post mapping to read child image URLs from `childPosts[]` (currently `idArray` keeps IDs only). Add `childImageUrls: string[]` to `InstagramPost`. **Verify the actor's child field shape during implementation** (likely `displayUrl`/`images`); degrade gracefully if absent.
- Raise comments per post from 5 → `ANALYSIS_COMMENTS_PER_POST` (default 15) in `mapApifyItems`; thread the cap through context budgeting.
- Surface video/reels explicitly: keep `type`/`productType`/`videoViewCount`/`videoDuration`, and label video posts in the report context so the model treats thumbnails as video stills.
- `FEATURE_FETCH_TAGGED` flag scaffolded (default off); **not wired to a second run in this effort**.

### B. Vision layer

- Analyze cover + up to `ANALYSIS_CAROUSEL_IMAGES_MAX` (default 4) slide images per post; preserve per-post evidence isolation and bounded-failure semantics.
- On a vision failure, one caption-only retry (no image) before marking failed.
- Capture structured vision (`objects`/`setting`/`visualStyle`) as data (not only the rendered string) so it can be aggregated. Persist structured JSON on `VisionAnalysisItem` (small Prisma migration: add `structured Json?`) to avoid lossy re-parsing on cache hits.

### C. Feature engineering (deterministic, cheap) — new `src/modules/reports/signals.ts`

Compute a `DerivedSignals` object fed to the report context as labeled signals:

- `engagement`: follower tier (nano/micro/mid/macro), ER band for that tier, `erVsBand: below|within|above` (heuristic bands, clearly labeled as heuristics).
- `followRatio` (follows/followers), `likeCommentRatio` + anomaly flag (bot/inflation suspicion).
- `cadence`: posts in last 30/90 days, per-month buckets, `trend: ramping|steady|cooling|dormant`.
- `contentMix`: post-type distribution over time (e.g., shift image→reels).
- `audience` (from comments): unique commenters, repeat commenters, emoji-only ratio, avg comment length, rough language mix.
- `visionAggregate`: frequency maps of recurring `settings`/`objects`/`visualStyle` from structured vision ("gym 8/30, beach 5/30").

New `src/modules/instagram/bio-parse.ts` — deterministic `profileSignals` from bio + externalUrl: emails, phones, other-platform handles (telegram/whatsapp/youtube/tiktok/linktree/etc.), links, city guesses, profession keywords. Feeds OSINT "Published contacts" and standard "Potential value of contact".

Relabel `relatedProfiles` in context as "IG-suggested similar accounts (algorithmic, not a confirmed network)".

### D. Prompts (v2 → v3) — new `src/prompts/section-guides.ts`

- One-line guide per required section per mode ("what this means + where to look"), injected into the report context as `sectionGuides` (keeps the system prompt lean).
- Strengthen each mode's system text: prioritise decision-relevant findings, require every non-obvious fact to attach evidence, calibrate confidence, and explicitly use `derivedSignals`/`profileSignals`/`visionAggregate`.
- Inject `goal` prominently when present.
- Bump prompt keys to `*.v3` (report + vision + chat).

### E. Generation / model

- Raise `LLM_FINAL_INPUT_TOKEN_BUDGET` default 24000 → 90000 (chars); soften the truncation tiers (higher caption/comment/vision caps, more graceful steps).
- Per-mode output budget (standard's 17 sections need room): raise default and/or set a mode-aware cap.
- Add `MODEL_REASONING_EFFORT` env (low|medium|high; default `high`) → pass as `reasoning.effort`.
- Keep `MODEL_REASONING` env-swappable; document a concrete A/B (e.g., a top-tier Claude/GPT slug) in `.env.example`. Default unchanged.

### F. Grounding / validation — new `src/modules/llm/grounding.ts`

- Deterministic `validateEvidenceSources(structuredReport, sourceCatalog)`: flag evidence URLs/postIds that do **not** exist in the supplied catalog (catches fabricated sources) — free.
- Optional `verifyGrounding(...)` LLM pass (model = `MODEL_GROUNDING`, default = chat/flash) behind `LLM_GROUNDING_CHECK` (default on): returns per-section unsupported-claim flags.
- `report-builder`: extend `reportIssueScore` and the repair trigger to include invalid-source count and unsupported-claim flags; repair instructed to drop/down-confidence flagged claims.

### G. Chat enrichment

- `report-chat.service` builds context from stored `report.metrics` + `sourceMap` + section list (top posts, digital circle, profile signals) as compact JSON, not only prose; raise chat input budget as needed.

### H. Config / tests

- New env in `env.ts` + `.env.example` (+ production assertions where a missing value would be unsafe): `LLM_GROUNDING_CHECK`, `MODEL_REASONING_EFFORT`, `MODEL_GROUNDING`, `FEATURE_FETCH_TAGGED`, `ANALYSIS_CAROUSEL_IMAGES_MAX`, `ANALYSIS_COMMENTS_PER_POST`, raised `LLM_FINAL_INPUT_TOKEN_BUDGET`.
- Prisma migration for `VisionAnalysisItem.structured`.
- Unit tests: bio-parse, signals (bands/cadence/audience), vision aggregation, evidence-source validation, section-guide injection, budget truncation, chat context builder, goal wizard payload. Keep existing 27 green; CI (`lint`/`typecheck`/`test`/`audit-economics`) stays green.

### I. Wizard UX (goal collection)

- Add `goal` to `AnalyzePayload`; new `WizardState` `waiting_goal`.
- For `standard`, route mode-select → `waiting_goal` (prompt + "Skip" button) → confirm; pass `goal` into `startAnalysis`.
- Locale strings in `ru`/`en`. Other modes unchanged.

## 5. Out of scope / deferred

- Tagged-feed second Apify run (flag scaffolded, off).
- Full video frame extraction / transcription; Stories / Highlights.
- Switching the default reasoning model (A/B only; explicit env change later).
- RAG/embeddings over report sections in chat.

## 6. Risks & mitigations

- **Apify field shapes** (carousel images, extra comments) uncertain → verify at implementation; degrade gracefully.
- **Token/cost & latency increase** (bigger budget + carousel vision + grounding pass) → all behind env knobs; document deltas; grounding behind a flag.
- **Prisma migration** (vision `structured`) → additive, nullable; safe `migrate deploy`.
- **Engagement bands are heuristics** → labeled as such in context so the model doesn't over-trust them.
- **Big diff** → implement per workstream with tests between; ship together.

## 7. Acceptance

- All new modules unit-tested; full suite + CI green.
- `goal` reaches the report context when provided; skippable.
- Report context includes `derivedSignals`, `profileSignals`, `visionAggregate`, `sectionGuides`; captions/comments no longer hard-truncated at 24k chars.
- Carousel slide images analyzed; comments ≥ configured cap when available.
- Fabricated evidence sources flagged; grounding pass influences repair when enabled.
- Chat answers data questions (e.g., "top posts by likes") from structured context.
