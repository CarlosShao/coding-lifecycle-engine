# Backup Strategy

> Phase: Phase 1 (plan) + Phase 4 (verify). Injected when the AI designs storage or before deploy.
> Authority: plan §8.3 #12 and §12.3; architecture Layer 5.6 (backups, DR, scaling).

## Why

"MVP doesn't need backups" is how data is lost forever. The lifecycle requires a backup +
recovery plan for **every** project tier, including MVP (architecture Layer 6: backups from
day 1). An untested backup is not a backup.

## What to back up

| Asset | Method | Notes |
|---|---|---|
| **Database** | `pg_dump` / WAL shipping / managed snapshot (RDS) | primary; point-in-time if available |
| **Object storage** | S3 versioning + cross-region copy | protect against overwrite/delete |
| **Build artifacts** | immutable registry / archive | reproducible deploys |
| **Secrets** | secret manager exports (encrypted) | not in git; recoverable via manager |
| **Config/IaC** | git (already versioned) | plus state files (Terraform) |

## Frequency & retention (baseline by maturity)

| Tier | Frequency | Retention | Target |
|---|---|---|---|
| MVP | daily dump + weekly export | 7 daily / 4 weekly | RPO ≤ 24h |
| Commercial | continuous WAL + hourly snapshot | 30 daily / 12 monthly | RPO ≤ 1h |
| Enterprise | PITR + multi-region replica | per RTO/RPO contract | RTO ≤ 1h |

Define **RPO** (max data loss) and **RTO** (max downtime) explicitly per project
(architecture Layer 5.6 references SRE availability math).

## Recovery drill (mandatory, not optional)

A backup you haven't restored is a hope, not a safeguard.

1. Quarterly (or pre-launch): restore the latest backup into an **isolated** environment.
2. Verify: DB opens, row counts match, app connects, smoke test passes.
3. Record the drill (date, who, RTO observed) in `docs/backup-dr-log.md`.
4. Automate the restore test in CI/nightly if feasible (restore to a throwaway DB).

## Operational rules

- Encrypt backups at rest; store keys in the secret manager (never beside the backup).
- Keep at least one copy **offsite / cross-region** from the primary.
- Never back up secrets into the same unencrypted bucket as data.
- Before any risky op (migration, force-push, contract change) take an on-demand backup
  (plan §16.8 checkpoint discipline).

## Checklist

- [ ] Backup covers DB + artifacts + object storage (versioned)
- [ ] Frequency/retention set per maturity; RPO/RTO defined
- [ ] Backups encrypted; keys separate from data
- [ ] At least one offsite/cross-region copy
- [ ] Restore drill performed and logged (date + RTO observed)
- [ ] On-demand backup taken before risky migrations/deploys
