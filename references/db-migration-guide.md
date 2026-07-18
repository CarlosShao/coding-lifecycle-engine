# Database Migration Guide

> Phase: Phase 1 (schema design) + Phase 2 (impl) + Phase 4 (deploy).
> Injected whenever the AI touches schema. Authority: plan §8.3 #5 and §16.8 (migration
> down mandatory). Architecture Layer 2.5 (data stores) and Layer 4 (deploy).

## Why

AI habitually issues raw `ALTER TABLE` inline in code or forgets rollback. A migration
system with **up + down** scripts is the only safe way to evolve schema across environments
and revert a bad deploy. This is a hard gate: no schema change without a reversible migration.

## Golden rules

1. **Never run raw DDL in application code.** All schema changes go through a migration tool.
2. **Every migration has an up AND a down** that restores the prior state.
3. **Migrations are immutable once applied.** Never edit a migration that shipped; write a new one.
4. **Test the down script** — an untested rollback is not a rollback.
5. **Migrations run in order, idempotently, behind a transaction where the engine allows.**
6. **Seed data is separate** from schema migrations (seed = repeatable, not versioned DDL).

## Tooling (pick per stack; architecture Layer 2.5)

| Stack | Tool | Notes |
|---|---|---|
| TypeScript/JS | **Prisma Migrate** | `prisma migrate dev` / `migrate deploy`; generates SQL |
| Java/JVM | **Flyway** | SQL or Java migrations, strong versioning |
| Python | **Alembic** (SQLAlchemy) | autogenerate + manual edit |
| Rust | **sqlx** `migrate!` / **SeaORM** | embedded SQL, compile-checked |
| Any / Postgres | **Atlas** | schema-as-code, diff-based, HCL/SQL |

## Migration anatomy (Prisma example)

```sql
-- migration.sql (up implied)
ALTER TABLE users ADD COLUMN last_login_at timestamptz;

-- down (must exist)
ALTER TABLE users DROP COLUMN last_login_at;
```

```ts
// sqlx: migrations/2024_01_15_0001_add_last_login/up.sql + down.sql
```

## Rollback testing procedure

1. Apply migration on a throwaway DB: `migrate deploy`.
2. Seed minimal data; exercise the new column/table.
3. Run `migrate down` (or `prisma migrate reset` to prior tag).
4. Assert pre-migration schema + data restored. If down fails → fix before merge.

## Seed data

- Keep seeds in `seeds/` (or tool-native), idempotent (upsert by natural key).
- Never seed prod secrets; use env-driven fixtures.
- Seeds are **not** part of the versioned migration chain.

## Backward/forward compatibility

- **Additive first**: add column as nullable or with default; backfill in a later migration.
- Avoid renaming/dropping in the same release that reads the old name (see `api-versioning.md`).
- For zero-downtime: expand (add) → deploy code that handles both → contract (drop) later.

## Checklist (merge + deploy gate)

- [ ] Schema change via migration tool, not raw DDL in code
- [ ] Up + down scripts both present and committed
- [ ] Migration tested forward AND rolled back on a clone
- [ ] No editing of already-applied migrations
- [ ] Seeds idempotent and separate from DDL
- [ ] Additive-first strategy used for hot paths (zero-downtime)
- [ ] DB backup taken before applying in staging/prod (`backup-strategy.md`)
