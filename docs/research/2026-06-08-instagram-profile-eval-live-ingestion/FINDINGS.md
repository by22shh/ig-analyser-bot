# Instagram Profile Eval

Date: 2026-06-08

Provider path used: public Instagram web_profile_info endpoint for profile/post input, then current project buildStrategicReport pipeline with OpenRouter vision/reasoning, deterministic grounding, quality evaluation, and repair when triggered.

Important limitation: APIFY_TOKEN is not present locally. In local non-production service mode this would select MockInstagramProfileProvider; production mode should fail configuration validation instead of silently using mock credentials. This eval isolates the analysis/report algorithm from that missing production ingestion credential.

| Profile | Followers | IG posts | Fetched posts | Engagement % | Vision | Sections | Source coverage | Quality | Warnings |
|---|---:|---:|---:|---:|---|---:|---:|---:|---|


Failed profiles:
- evachkaaaaa: OPENROUTER_API_KEY_MISSING (profile fetched: followers=1289, posts=141, fetched=12)
- missstaccyy: OPENROUTER_API_KEY_MISSING (profile fetched: followers=587, posts=23, fetched=12)
- _daria.bers_: OPENROUTER_API_KEY_MISSING (profile fetched: followers=748, posts=118, fetched=12)
- fakeev: OPENROUTER_API_KEY_MISSING (profile fetched: followers=57755, posts=1087, fetched=12)
- mark.tales: OPENROUTER_API_KEY_MISSING (profile fetched: followers=443, posts=96, fetched=12)
