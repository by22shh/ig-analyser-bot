# Instagram Profile Eval

Date: 2026-06-08

Provider path used: Apify apify~instagram-scraper for profile/post input, then current project buildStrategicReport pipeline with OpenRouter vision/reasoning, deterministic grounding, quality evaluation, and repair when triggered.

Important limitation: this run uses APIFY_TOKEN from the environment and exercises production-like ingestion.

| Profile | Followers | IG posts | Fetched posts | Engagement % | Vision | Sections | Source coverage | Quality | Content quality | Warnings |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---|
| evachkaaaaa | 1289 | 141 | 30 | 1.55 | completed:30 | 17 | 17/17 | 100 | 61 | none |
| missstaccyy | 587 | 23 | 22 | 22.67 | completed:22 | 17 | 17/17 | 100 | 64 | none |
| _daria.bers_ | 748 | 118 | 30 | 11.71 | completed:29, skipped:1 | 17 | 17/17 | 93 | 47 | Vision coverage: 29/30 визуальных элементов. | Quality flags: score 93/100, 1 medium/high findings |
| fakeev | 57754 | 1087 | 30 | 0.91 | completed:30 | 17 | 17/17 | 93 | 72 | Формат отчёта: recent 30-post read; покрытие выборки 2.8% (30/1087). Выводы описывают выбранные публичные посты, а не весь профиль. | Quality flags: score 93/100, 1 medium/high findings |
| mark.tales | 444 | 96 | 30 | 16.26 | completed:29, skipped:1 | 17 | 17/17 | 93 | 72 | Vision coverage: 29/30 визуальных элементов. | Quality flags: score 93/100, 1 medium/high findings |

Failed profiles:
- none
