# CI Pipeline Template

> Phase: Phase 1 (setup) + Phase 2/3 (gates) + Phase 4 (deploy).
> Injected when the AI configures CI/CD. Authority: plan §8.3 #20; architecture Layer 4.3 (CI/CD).

## Why

No CI = manual, error-prone deploys and unenforced quality. The pipeline is a sequence of
**gated stages**; each stage must pass before the next runs. This is the mechanical enforcer
of every other reference in this folder.

## Stage order (build → lint → test → scan → deploy)

```
1. build      compile / type-check / install (from lockfile)
2. lint       formatter check + linter + type-check (strict)
3. test       unit → integration → (perf if hot path)
4. scan       SAST + dependency/secret scan  (critical = BLOCK)
5. deploy     only on protected branches / tags, after gates
```

Each stage fails fast and stops the pipeline. No stage may be skipped to "get green".

## Per-stage gates

| Stage | Gate | Block on |
|---|---|---|
| build | clean install from lockfile; compile/typecheck | any error |
| lint | prettier/black/gofmt + eslint/ruff/clippy; `missing_docs` | warnings as errors in CI |
| test | unit + integration; coverage ≥ threshold (default 80%) | failing test / under coverage |
| scan | SAST + `npm audit`/`pip-audit`/`cargo audit` + gitleaks | **critical** vuln or leaked secret |
| deploy | requires prior stages green + approvals | missing sign-off |

## Artifact handling

- Build **once**, promote the same artifact through envs (architecture Layer 1.6 build-release-run).
- Store artifacts in a registry; pin by commit SHA / tag (reproducible, `changelog-release.md`).
- Never rebuild per environment with different flags — config via env only (`env-config.md`).

## Required checks before merge (branch protection)

- [ ] CI green on the PR (all 5 stages).
- [ ] `commitlint` / conventional PR title passes.
- [ ] Coverage threshold maintained or intentionally raised.
- [ ] No secret scan findings.
- [ ] At least one review approval (`pr-review-checklist.md`).

## Progressive delivery (scale, architecture Layer 4.3)

- Use blue-green / canary (Argo Rollouts / Flagger) once frequent deploys can't tolerate full outages.
- Gate rollout on SLO/error-budget (`observability-minimal.md`, `performance-budget.md`).

## Example (GitHub Actions skeleton)

```yaml
on: [pull_request, push]
jobs:
  ci:
    steps:
      - uses: actions/checkout@v4
      - run: make build        # install from lockfile + compile
      - run: make lint         # formatter + linter + typecheck
      - run: make test         # unit + integration + coverage
      - run: make scan         # sast + audit + gitleaks (critical=exit 1)
  deploy:
    needs: ci
    if: github.ref == 'refs/heads/main'
    steps:
      - run: make deploy       # after gates + approvals
```

## Checklist

- [ ] 5 stages present and ordered: build→lint→test→scan→deploy
- [ ] Each stage fails fast and gates the next
- [ ] Coverage threshold enforced; lint warnings = errors in CI
- [ ] Critical vuln / secret leak BLOCKS (not warns)
- [ ] Single artifact built once, promoted via env config
- [ ] Branch protection requires green CI + PR review before merge
