# Release Readiness Gate

> Phase: Phase 4 (delivery / handoff). Injected as the consolidated pre-handoff checklist.
> Authority: plan §8.3 #20, §16.3 (release_signoff), §16.8 (rollback verified),
> and §12.3 (product-delivery risks). Consolidates approvals + checklists + rollback + monitoring + docs.

## Why

Individual checklists (security, backup, CI, perf) can all be "done" yet the release still
ship broken because nobody tied them together. This is the **single consolidated gate** the
AI must satisfy before `handoff`. It is the release-level DoD (plan §16.2 nested DoD).

## The gate (all must be TRUE to hand off)

### 1. Approvals — `release_signoff`
- [ ] Human approver recorded in `approvals` (gate=`release_signoff`, state=`approved`).
- [ ] If maturity=enterprise: `architecture_approval` + `stack_approval` also approved.
- [ ] No open `blocked` tasks; external deps either resolved or explicitly豁免 (plan HP4).

### 2. Checklist completion (cross-reference)
- [ ] **CI green** through all 5 stages (`ci-pipeline-template.md`).
- [ ] **Security gate** passed: no critical findings, headers/CSP, secrets absent
      (`security-baseline.md`).
- [ ] **Tests green** + coverage threshold met; no quarantined/flaky tests ignored
      (`flaky-test-protocol.md`).
- [ ] **Performance budget** met; no un-investigated regression (`performance-budget.md`).
- [ ] **Accessibility/i18n** gate passed for UI (`accessibility-i18n.md`).

### 3. Rollback plan (verified, not theoretical — plan §16.8)
- [ ] DB migration has a **tested down script** (`db-migration-guide.md`).
- [ ] On-demand backup taken immediately before deploy (`backup-strategy.md`).
- [ ] Known-good previous artifact/tag identified for instant revert.
- [ ] Feature flags in place for risky paths → runtime kill-switch (`feature-flags.md`).
- [ ] Rollback steps written in the runbook and rehearsed (at least once on staging).

### 4. Monitoring / alerting verified
- [ ] Sentry + structured logs live; error spike alerts wired (`observability-minimal.md`).
- [ ] Health endpoints (`/healthz`, `/readyz`) returning OK in the target env.
- [ ] SLO/alert rules exist for critical paths; on-call notified on breach.
- [ ] Correlation id / tracing observable for the new code paths.

### 5. Docs & changelog
- [ ] CHANGELOG updated + version tagged (`changelog-release.md`).
- [ ] README/CONTRIBUTING current; new setup steps if any (`onboarding-template.md`).
- [ ] API docs (OpenAPI/rustdoc/JSDoc) regenerated + in sync (`documentation-standards.md`).
- [ ] ADRs recorded for significant decisions; runbooks for new operability concerns.

## Handoff rule (hard, plan §15 acceptance)

> **Do NOT call `handoff` until every box above is checked.** The MCP server must reject
> `handoff` when `release_signoff` is not `approved` (plan §16.3). "Looks done" is not a gate.

## Pre-mortem tie-in (plan Phase 4)

Before sign-off, run `pre-mortem.md`: enumerate the top failure modes in 3 months and confirm
each is covered by the items above (backup, rollback, monitoring, alerting). If a likely failure
has no mitigation, it blocks release.

## Checklist (this file is the checklist)

- [ ] release_signoff approved; no open blockers
- [ ] CI / security / test / perf / a11y gates all green
- [ ] Rollback: tested down migration + pre-deploy backup + revert target + flags
- [ ] Monitoring live: Sentry/logs/health/SLO alerts verified in target env
- [ ] Docs + changelog + tags + API docs updated
- [ ] Pre-mortem mitigations cover top failure modes
