# Onboarding Template (README + CONTRIBUTING)

> Phase: Phase 1 (skeleton). Injected when the AI scaffolds a repo or a new session clones it.
> Authority: plan §8.3 #10; architecture Layer 1 (skeleton) and Layer 1.4 (branching).

## Why

A repo a new engineer (or a fresh AI session) can't stand up in one command is a tax paid on
every handoff. The lifecycle requires every project to be runnable from a clean clone.

## README standard (`./README.md`)

```markdown
# <Project Name>

One-line description.

## Stack
- Backend: <lang/framework>  |  Frontend: <framework>  |  DB: <db>

## Prerequisites
- Node 20+ / Python 3.12 / Go 1.22 / Rust 1.78
- Docker (for deps) or local Postgres/Redis

## Quick start (one command)
    make setup && make dev        # or: ./scripts/setup.sh

## Common commands
- `make test` / `make lint` / `make build`
- `make migrate` (applies DB migrations)

## Project layout
- `src/` service code · `migrations/` schema · `docs/` ADRs

## Docs
- CONTRIBUTING.md · ADRs in `docs/adr/`
```

## CONTRIBUTING standard (`./CONTRIBUTING.md`)

```markdown
## Setup
1. `cp .env.example .env` and fill dev values (no real secrets).
2. `make setup` installs deps + boots local deps (docker compose).
3. `make migrate` creates schema.

## Dev loop
- Run tests: `make test`  (must be green)
- Lint/format: `make lint` (pre-commit enforced)
- Commit: Conventional Commits (see git-commit-convention.md)

## Before opening a PR
- [ ] Tests green · [ ] Lint green · [ ] README/CONTRIBUTING updated if setup changed
- [ ] PR template filled; references a ticket/ADR

## Branching
- Trunk-based / GitHub Flow (see architecture Layer 1.4). Short-lived feature branches.
```

## One-command setup (hard requirement)

Provide `make setup` / `./scripts/setup.sh` that:
1. Installs toolchain + deps (idempotent).
2. Starts local dependencies (docker compose: db, redis, mailhog).
3. Runs migrations (`db-migration-guide.md`).
4. Seeds dev data (idempotent, no real secrets).
5. Leaves the app running on a known port.

A fresh clone → single command → working app is a Definition-of-Done gate.

## Checklist

- [ ] README has stack, prerequisites, one-command quick start, layout, docs links
- [ ] CONTRIBUTING has setup, dev loop, PR rules, branching model
- [ ] `.env.example` present; `.env` gitignored
- [ ] `make setup` (or script) boots deps + migrates + seeds + runs
- [ ] A clean clone reaches a working app with one command
- [ ] Test/lint/build commands documented and actually work
