---
name: project_economics_support_reserve
description: Support reserve is additive in the economics model.
metadata:
  type: project
---

# Economics Support Reserve Memory

`ECON_STANDARD_REPORT_COST_P75_RUB` now means provider/report p75 cost before support reserve. `economicsSettingsFromEnv()` adds `ECON_SUPPORT_RESERVE_RUB` separately to Standard, photo search, and Standard-derived modes.

The default safe scenario is `50 RUB provider/report p75 + 5 RUB support = 55 RUB fully loaded Standard`, which passes at 100 units with 3.01x. The old `55 + 5` scenario now produces a fully loaded Standard cost of 60 RUB, requires 109 units, and fails the guardrail.

Finance reconciliation, alerting, launch reports, and cost anomaly detection should use the fully loaded modeled mode cost when discussing margin.
