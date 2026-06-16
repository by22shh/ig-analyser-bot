---
name: project_mini_app_visual_smoke
description: Mini App UI smoke should use local fixtures and a low-version Telegram WebApp stub to verify fallback-safe rendering.
metadata:
  type: project
---

For Mini App UI regressions, prefer `pnpm smoke:mini-app-ui`. It serves `public/mini-app` with local API fixtures, captures mobile/desktop screenshots under `docs/audit/2026-06-12-fix-all-problems/screenshots/phase-11/`, and asserts no horizontal document overflow.

The smoke intentionally injects a Telegram WebApp stub with `version: "6.0"` and only minimal methods. This exercises version/support guards for optional Telegram APIs without requiring the real Telegram browser.
