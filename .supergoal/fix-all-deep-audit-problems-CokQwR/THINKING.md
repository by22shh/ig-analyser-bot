# Thinking: Fix All Deep Audit Problems

## Goal

Закрыть все repo-addressable проблемы из deep audit: P1 launch blockers, P2 product/ops/security gaps и P3 hardening items. Итог должен быть не просто зелёный CI, а проверяемый путь к paid public launch: экономика считает support reserve, есть backup/restore proof, finance reconciliation, alerts, staging smoke, privacy/admin tests, Mini App polish, deployment hardening и финальная проверка.

## Constraints

- Рабочее дерево уже грязное: существующие изменения считаются user-owned baseline и не откатываются.
- Live provider secrets не должны читаться или печататься. Staging/live действия должны иметь dry-run/mock/test modes и runbook gates.
- Юридический sign-off нельзя "закодить"; нужно создать audit trail, policy checklist и blocking release docs для HR/OSINT/photo-search.
- Fly production parity нельзя честно подтвердить без deploy/live eval; repo должен получить deploy/eval checklist и скриптовые gates, но финальный verdict должен отличать local repo from deployed production.

## Top 3 Risks

1. **Слишком широкий scope ломает продуктовые paths** - likelihood: high. Mitigation: фазы маленькие и independently verifiable; каждая фаза запускает targeted tests плюс typecheck/lint; final audit re-runs aggregate commands.
2. **Ops gaps будут закрыты только документами, а не proof** - likelihood: medium. Mitigation: docs должны сопровождаться scripts/checks/templates where possible: finance export, alert rules validation, restore drill checklist, smoke runner, SQL snippets.
3. **External-provider checks могут случайно требовать реальные секреты** - likelihood: medium. Mitigation: smoke pack должен fail closed only in explicit live mode; default dry-run не печатает secrets; live commands documented as optional staging gates.

## Dependencies

- Economics semantics should be fixed before final pricing/readiness claims.
- Finance export and cost anomaly detection depend on economics model semantics.
- Alerting depends on final event names, provider errors, queue/payment/retry metrics.
- UI payment states depend on payment API error taxonomy.
- Final polish depends on all code/runbook/script phases.

## Scope Interpretation

"Исправь все проблемы" means: implement every fix that can reasonably live in this repository. For external actions that require a real staging environment, provider credentials, legal approval, or GitHub repository settings, implement the code/config/docs/gates that make them executable and explicit, and mark the real-world action as an operator step rather than pretending it is done.

## Best Practices Applied

- Money paths require deterministic tests and reconciliation exports.
- Provider contracts need one repeatable staging smoke gate, not isolated ad hoc scripts.
- Security/privacy maturity requires auditability, not only access checks.
- UX polish should be verified visually across mobile/desktop and long/error states.
- CI should prove DB migrations and integration tests with real PostgreSQL.

