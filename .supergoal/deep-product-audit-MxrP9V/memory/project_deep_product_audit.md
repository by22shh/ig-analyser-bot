---
name: project_deep_product_audit
description: Deep audit learnings for the Instagram Analyzer Telegram Bot product.
metadata:
  type: project
---

# Deep Product Audit Memory

Future audits of this repository should start by separating three readiness layers: local repository quality, currently deployed Fly production quality, and paid public launch readiness. In this run the local repository was a strong controlled-beta candidate, while Fly production lagged behind local evidence depth and paid launch still had P1 operational/economic blockers.

Key recurring audit focus areas:

- Economics: `ECON_SUPPORT_RESERVE_RUB` is required/documented, but the current economics audit does not add it to Standard report cost. Decide whether support is already included in `ECON_STANDARD_REPORT_COST_P75_RUB`; if additive, Standard at 55+5 RUB falls below the target multiple and needs repricing or model changes.
- Operations: do not call the product paid-public-ready without a tested backup/restore/PITR runbook, finance reconciliation export/dashboard, and concrete alert thresholds/routing.
- Quality claims: golden evals can be green locally while Fly production still differs. Deploy and re-run Fly eval before claiming production quality.
- Security/privacy: existing gates are strong, but best-in-class claims need OSINT lawful-basis audit artifacts, admin grant/refund tests, and a fuller delete-me contract.
- UI/UX: screenshots and smoke checks are useful, but RU-first Mini App copy and payment failure states remain polish areas to inspect manually.

Useful audit artifacts from this run live under `docs/audit/2026-06-12-deep-product-audit/`, especially `FINAL-AUDIT.md` and `BEST-IN-CLASS-GAP-ANALYSIS.md`.
