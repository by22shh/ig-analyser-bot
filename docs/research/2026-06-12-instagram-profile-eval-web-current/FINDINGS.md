# Instagram Profile Eval

Date: 2026-06-08

Provider path used: public Instagram web_profile_info endpoint for profile/post input, then current project buildStrategicReport pipeline with OpenRouter vision/reasoning, deterministic grounding, quality evaluation, and repair when triggered.

Important limitation: APIFY_TOKEN is not present locally. In local non-production service mode this would select MockInstagramProfileProvider; production mode should fail configuration validation instead of silently using mock credentials. This eval isolates the analysis/report algorithm from that missing production ingestion credential.

| Profile | Followers | IG posts | Fetched posts | Engagement % | Vision | Sections | Source coverage | Quality | Content quality | Warnings |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---|


Failed profiles:
- evachkaaaaa: ACCESS_DENIED_CREDITS (profile fetched: followers=1285, posts=141, fetched=12)
- missstaccyy: ACCESS_DENIED_CREDITS (profile fetched: followers=587, posts=23, fetched=12)
- _daria.bers_: ACCESS_DENIED_CREDITS (profile fetched: followers=750, posts=118, fetched=12)
- fakeev: ACCESS_DENIED_CREDITS (profile fetched: followers=57691, posts=1087, fetched=12)
- mark.tales: ACCESS_DENIED_CREDITS (profile fetched: followers=442, posts=94, fetched=12)
