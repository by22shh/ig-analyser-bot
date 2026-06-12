# Instagram Profile Eval

Date: 2026-06-08

Provider path used: Apify apify~instagram-scraper for profile/post input, then current project buildStrategicReport pipeline with OpenRouter vision/reasoning, deterministic grounding, quality evaluation, and repair when triggered.

Important limitation: this run uses APIFY_TOKEN from the environment and exercises production-like ingestion.

| Profile | Followers | IG posts | Fetched posts | Engagement % | Vision | Sections | Source coverage | Quality | Content quality | Warnings |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---|
| evachkaaaaa | 1285 | 141 | 30 | 1.56 | completed:30 | 17 | 14/17 | 65 | 84 | Quality flags: score 65/100, 5 medium/high findings |
| missstaccyy | 587 | 23 | 22 | 22.70 | completed:22 | 17 | 17/17 | 100 | 84 | none |
| _daria.bers_ | 751 | 118 | 30 | 11.66 | completed:30 | 17 | 15/17 | 61 | 78 | Quality flags: score 61/100, 4 medium/high findings |
| fakeev | 57690 | 1087 | 30 | 0.91 | completed:29, skipped:1 | 17 | 17/17 | 86 | 97 | Формат отчёта: recent 30-post read; покрытие выборки 2.8% (30/1087). Выводы описывают выбранные публичные посты, а не весь профиль. | Vision coverage: 29/30 визуальных элементов. | Quality flags: score 86/100, 2 medium/high findings |
| mark.tales | 442 | 94 | 30 | 16.59 | completed:30 | 17 | 17/17 | 100 | 96 | none |

Failed profiles:
- none
