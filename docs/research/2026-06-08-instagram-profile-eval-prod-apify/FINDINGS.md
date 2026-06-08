# Production-like Instagram Profile Eval

Date: 2026-06-08

Input path: Apify `apify~instagram-scraper` using production runtime token, then local current `buildStrategicReport` with production OpenRouter key. No secrets are stored in this folder. Quality scores below were recalculated after adding sample-coverage penalties.

| Profile | Apify posts | Sections | Source coverage | Vision | Quality | Grounding flags | Warnings |
|---|---:|---:|---:|---|---:|---:|---|
| `evachkaaaaa` | 30/141 (21.3%) | 17 | 17/17 | {"completed":29,"skipped":1} | 93 | 0 | Quality flags: score 93/100, 1 medium/high findings |
| `missstaccyy` | 22/23 (95.7%) | 17 | 17/17 | {"completed":22} | 100 | 0 | none |
| `_daria.bers_` | 30/118 (25.4%) | 17 | 17/17 | {"completed":30} | 100 | 0 | none |
| `fakeev` | 30/1087 (2.8%) | 17 | 17/17 | {"completed":30} | 93 | 0 | Quality flags: score 93/100, 1 medium/high findings |
| `mark.tales` | 30/96 (31.3%) | 17 | 17/17 | {"completed":30} | 100 | 0 | none |

## Verdict

Fresh production-like rerun is materially better than the saved first pass: vision completed for 141/142 selected images, all five profiles produced 17 sections, and deterministic grounding found 0 fabricated-source or forbidden-inference flags. After sample-coverage penalties, average quality is 97.2/100. The remaining weakness is sample coverage for large accounts, especially `fakeev` at 30/1087 posts (2.8%).
