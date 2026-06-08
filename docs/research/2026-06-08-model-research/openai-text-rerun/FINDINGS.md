# OpenRouter model research — Instagram analyzer

Date: 2026-06-07T21:35:54.218Z
OpenRouter models snapshot: 341 models
FX assumption: 90 RUB/USD

## Vision ranking

| Rank | Model | Score | Cost, 5 imgs | Est. cost x30 | Avg latency | Tier notes |
| ---: | --- | ---: | ---: | ---: | ---: | --- |

## Reasoning ranking

| Rank | Model | Score | Cost | Latency | Sections | Missing | Grounding flags | Tier |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | `openai/gpt-5.5` | 73 | $0.1975 (17.8 ₽) | 102.2s | 17 | 0 | 0 | full |
| 2 | `openai/gpt-5.4` | 66 | $0.1100 (9.9 ₽) | 102.0s | 17 | 0 | 0 | full |

## Notes

- Scores are rubric scores, not universal truth. Read raw outputs in `outputs/` before changing production defaults.
- Vision score rewards OCR, screenshot/repost detection, visible-object coverage, and refusal to infer relationships/private facts.
- Reasoning score rewards all required sections, source coverage, sample-size calibration, useful hooks, and zero deterministic grounding violations.
- OpenRouter model metadata and prices are saved in `openrouter-models.snapshot.json`.
