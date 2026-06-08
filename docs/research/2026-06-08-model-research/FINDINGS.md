# OpenRouter model research — Instagram analyzer

Date: 2026-06-08 (local), 2026-06-07 UTC in generated JSON
Harness: `scripts/openrouter-model-research.ts`
OpenRouter snapshot: 341 models from `/api/v1/models`
FX assumption: 90 RUB/USD

## Decision

Recommended production bundle:

| Pipeline step | Recommended model | Why |
| --- | --- | --- |
| Vision / image descriptions | `google/gemini-2.5-flash` | Best stable default: near-top quality, fastest enough, very cheap, and accepted structured JSON on all 5 cases. |
| Vision budget fallback to test | `qwen/qwen3-vl-235b-a22b-instruct` | Cheapest high-quality candidate in this run, also accepted structured JSON. Needs A/B on real Instagram media before replacing Gemini. |
| Final profile analysis | `x-ai/grok-4.3` for cost/latency, or `openai/gpt-5.5` for premium-safe mode | Grok was the best practical result: full structured output, 17/17 sections, no grounding flags, ~21s, ~$0.021. GPT-5.5 was similarly good in text-mode rerun but ~5x slower and ~9.5x more expensive. |
| Conservative fallback | `anthropic/claude-opus-4.8` | Safe and well-calibrated, but slower, pricier, and fell back to text mode. Good for max-safety/manual premium, not default. |
| Keep for grounding/chat | `google/gemini-2.5-flash` | Cheap and structured. Better value for optional grounding/chat than larger models. |

If we optimize for "best user-visible report per ruble and second", switch `MODEL_REASONING` to `x-ai/grok-4.3` and keep `MODEL_VISION=google/gemini-2.5-flash`.

If we optimize for "premium OpenAI safety/brand preference", keep `MODEL_REASONING=openai/gpt-5.5`, but do **not** rely on 8000-token structured JSON for full 17-section reports: this run produced truncated invalid JSON. Use larger output budget once credits allow retesting, or intentionally run/report fallback text mode.

## Vision results

5 image cases:

- real Instagram-like Sochi screenshot with black bars and clothing text;
- product/fashion poster with English OCR;
- Story/repost UI;
- cafe menu with Cyrillic OCR;
- carousel cover/content slide.

| Rank | Model | Score | Cost, 5 imgs | Est. cost x30 | Avg latency | Structured tier |
| ---: | --- | ---: | ---: | ---: | ---: | --- |
| 1 | `openai/gpt-5.5` | 92.8 | $0.0922 (8.3 ₽) | 49.8 ₽ | 8.9s | no-structured |
| 2 | `google/gemini-2.5-flash` | 91.8 | $0.0065 (0.6 ₽) | 3.5 ₽ | 2.8s | full |
| 3 | `google/gemini-3.5-flash` | 91.8 | $0.0529 (4.8 ₽) | 28.6 ₽ | 6.7s | full |
| 4 | `qwen/qwen3-vl-235b-a22b-instruct` | 91.2 | $0.0030 (0.3 ₽) | 1.6 ₽ | 6.9s | full |
| 5 | `anthropic/claude-sonnet-4.6` | 91.2 | $0.0421 (3.8 ₽) | 22.7 ₽ | 15.2s | no-structured |
| 6 | `google/gemini-3.1-flash-lite` | 90.8 | $0.0040 (0.4 ₽) | 2.2 ₽ | 2.6s | full |
| 7 | `x-ai/grok-4.3` | 89.2 | $0.0202 (1.8 ₽) | 10.9 ₽ | 5.3s | full |
| 8 | `anthropic/claude-opus-4.8` | 88.8 | $0.0982 (8.8 ₽) | 53.0 ₽ | 10.3s | no-structured |
| 9 | `openai/gpt-5.4-mini` | 85.0 | $0.0093 (0.8 ₽) | 5.0 ₽ | 2.5s | no-structured |
| 10 | `qwen/qwen3-vl-32b-instruct` | 63.4 | $0.0011 (0.1 ₽) | 0.6 ₽ | 4.1s | no-structured |

Vision conclusion:

- `openai/gpt-5.5` had the best raw score, but it is too expensive for 30 images and did not accept the structured path in this run.
- `google/gemini-2.5-flash` remains the best production default: almost same quality, structured on every case, and about 14x cheaper than `gpt-5.5` for the 5-image set.
- `qwen/qwen3-vl-235b-a22b-instruct` is the most interesting challenger: very cheap, high score, structured. Run a real-profile A/B before switching.
- `google/gemini-3.1-flash-lite` is also viable and very cheap, but scored slightly below current `gemini-2.5-flash`.

## Reasoning results

Scenario:

- 8-post public profile sample out of 143 total posts;
- repeated visual/text patterns around Sochi, sea, coffee, fashion/design, content planning;
- relationship trap comment: "Какая вы пара красивая";
- goal: safe, respectful dialogue hooks without personal assumptions.

Primary run used production-like structured schema with fallback ladder.

| Rank | Model | Score | Cost | Latency | Sections | Missing | Grounding flags | Tier |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | `x-ai/grok-4.3` | 74 | $0.0207 (1.9 ₽) | 21.2s | 17 | 0 | 0 | full |
| 2 | `anthropic/claude-opus-4.8` | 67 | $0.1783 (16.0 ₽) | 88.4s | 17 | 0 | 0 | no-structured |
| 3 | `google/gemini-3.1-pro-preview` | 62 | $0.0794 (7.1 ₽) | 72.2s | 17 | 0 | 0 | no-structured |
| 4 | `minimax/minimax-m3` | 56 | $0.0114 (1.0 ₽) | 190.8s | 13 | 4 | 0 | no-structured |
| 5 | `anthropic/claude-sonnet-4.6` | 44 | $0.1412 (12.7 ₽) | 164.8s | 12 | 5 | 0 | no-structured |
| 6 | `google/gemini-2.5-pro` | 43 | $0.0777 (7.0 ₽) | 143.2s | 17 | 0 | 0 | no-structured |
| 7 | `google/gemini-3.5-flash` | 27 | $0.0816 (7.3 ₽) | 64.5s | 12 | 5 | 0 | no-structured |

OpenAI structured caveat:

| Model | Structured run | What happened |
| --- | ---: | --- |
| `openai/gpt-5.4` | $0.1374, 116.8s | Returned useful JSON content but it was truncated/invalid at 8000 max tokens. |
| `openai/gpt-5.5` | $0.2747, 115.5s | Same: strong visible content, but invalid truncated JSON. |
| `openai/gpt-5.5-pro` | not measured | OpenRouter returned HTTP 402: available credits could not cover 9000 max tokens. |

OpenAI text-mode rerun (no `response_format`) to measure reasoning quality without JSON truncation:

| Model | Score | Cost | Latency | Sections | Missing | Grounding flags |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `openai/gpt-5.5` | 73 | $0.1975 (17.8 ₽) | 102.2s | 17 | 0 | 0 |
| `openai/gpt-5.4` | 66 | $0.1100 (9.9 ₽) | 102.0s | 17 | 0 | 0 |

Reasoning conclusion:

- `x-ai/grok-4.3` was the surprise winner for production: complete structured report, good concrete hooks, no deterministic grounding flags, ~21 seconds, low cost.
- `openai/gpt-5.5` is still qualitatively strong and safe, but needs either a larger structured output budget or a deliberate text fallback path. At 8000 max tokens, structured JSON can truncate.
- `openai/gpt-5.4` is a cheaper OpenAI fallback, but its report felt less rich than GPT-5.5 and not better than Grok in this run.
- `claude-opus-4.8` remains the safest-feeling text, with excellent hedging and low "high confidence" overuse. It is not the best default because it is slower, expensive, and no-structured.
- `google/gemini-2.5-pro` no longer triggered the old relationship inference in this scenario, but it was slow, overconfident, and weaker on source formatting. I would not return to it as default.

## Integration changes implied

1. Add `x-ai/grok-4.3` as a documented `MODEL_REASONING` option and run a small live A/B before switching the code default.
2. Keep `MODEL_VISION=google/gemini-2.5-flash` for now; A/B `qwen/qwen3-vl-235b-a22b-instruct` on real Instagram images.
3. If keeping `openai/gpt-5.5`, raise `LLM_FINAL_OUTPUT_TOKEN_BUDGET` above 8000 and retest structured JSON when OpenRouter credits allow. OpenRouter docs note reasoning tokens count as output tokens, so budget has to cover both reasoning and the final answer.
4. Keep deterministic grounding; it is essential for relationship/private-life claims and fabricated citations.
5. Consider enforcing concise structured fields if we want structured JSON with premium models: long section content + evidence arrays make truncation more likely.

## Artifacts

- Raw model outputs: `docs/research/2026-06-08-model-research/outputs/`
- OpenAI text rerun: `docs/research/2026-06-08-model-research/openai-text-rerun/`
- Failed GPT-5.5 14k structured credit probe: `docs/research/2026-06-08-model-research/gpt55-structured-14k/`
- Model metadata snapshot: `docs/research/2026-06-08-model-research/openrouter-models.snapshot.json`

## Sources

- OpenRouter chat completions endpoint: `https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request`
- OpenRouter model metadata fields and supported parameters: `https://openrouter.ai/docs/guides/overview/models`
- OpenRouter reasoning-token behavior: `https://openrouter.ai/docs/guides/best-practices/reasoning-tokens`
- OpenRouter structured outputs: `https://openrouter.ai/docs/guides/features/structured-outputs`
