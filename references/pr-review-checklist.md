# PR Review Checklist

> Phase: Phase 3 (review). Injected when the AI opens/self-reviews a PR.
> Distinct from `adversarial-review.md` (5-role red-team). This is the **daily, routine**
> code-review gate every PR must pass before merge.

## Why

Routine review catches the 80% of defects that aren't security/correctness emergencies:
naming, single-responsibility, missing tests, lint noise. The AI tends to skip PR bodies and
rubber-stamp its own work — this checklist forces structure.

## PR template (commit as `.github/PULL_REQUEST_TEMPLATE.md`)

```markdown
## What & Why
<!-- one paragraph: what changes, and why (link the ticket/ADR) -->

## Changes
- 

## Test plan
- [ ] unit / integration tests added or updated
- [ ] manual steps (if UI): 

## Checklist
- [ ] Self-reviewed diff for intent
- [ ] No leftover debug/`console.log`/TODO without ticket
- [ ] Docs updated where public API changed
```

## Daily code-review checklist (reviewer = AI self + human)

**Correctness & design**
- [ ] **Single responsibility** — file/function does one thing; no 800-line god module.
- [ ] Change is the *minimum* needed; no scope creep, no speculative "future" code.
- [ ] Public API/behavior matches the ticket (see `spec-conformance-check.md`).

**Naming & readability**
- [ ] Names are semantic — no `data`, `temp`, `handle`, `foo`, `x1`.
- [ ] No magic numbers/strings — extracted to named constants.
- [ ] Comments explain *why* (non-obvious), not *what* the code says.

**Error handling**
- [ ] No empty `catch` / bare `unwrap` / swallowed errors (see `error-handling-patterns.md`).
- [ ] Errors surface with context; failures are logged, not silent.

**Tests & quality gates**
- [ ] Tests are green locally and in CI.
- [ ] New behavior has tests; bug fix includes a regression test.
- [ ] Lint is green (no warnings suppressed to pass).
- [ ] Coverage threshold maintained (default 80%, per `conventions`).

**Config & secrets**
- [ ] No secrets/hosts hardcoded; uses env + secret references (`env-config.md`).
- [ ] `.env.example` updated if new vars added.

**Docs**
- [ ] Public API/exports documented where required.
- [ ] README/CONTRIBUTING updated if setup/run changed (`onboarding-template.md`).

## Reviewer etiquette (for the AI when reviewing)

- Be specific: cite the line, propose the fix.
- Block on correctness/security/secrets; comment (non-blocking) on style nits.
- Approve only when every blocking item is resolved.

## Checklist (merge gate)

- [ ] PR template filled (what/why/test plan)
- [ ] All daily-checklist items satisfied
- [ ] CI green: build → lint → test → scan
- [ ] At least one approval recorded (or `ticket_review` gate passed)
