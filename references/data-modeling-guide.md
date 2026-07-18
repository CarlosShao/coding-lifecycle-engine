# Data Modeling Guide

> Phase: Phase 1 (schema design) + Phase 2 (impl). Injected when the AI designs tables/collections.
> Authority: plan §8.3 #19; architecture Layer 2.5 (data & middleware), Layer 1.6 (config).

## Why

Bad data models cause slow queries, migration pain, and data corruption later. Design for the
access pattern, not the textbook. This pairs tightly with `db-migration-guide.md`.

## Normalization vs denormalization

| Form | Use when | Avoid when |
|---|---|---|
| **3NF normalized** | OLTP, write-heavy, consistency matters | read-heavy reporting |
| **Denormalized** | read-heavy, few writes, low-latency reads | high write contention |
| **Hybrid** | normalized source + cached/materialized read models | most real systems |

Rule: start normalized; denormalize **only** for a measured read bottleneck, and document why
(ADR). Don't pre-optimize with duplicated data "just in case".

## Keys & identity

- **Primary key**: stable, never business-meaningful (no email/SSN as PK). Use surrogate
  (`bigint`/`uuid`) unless a natural key is truly immutable.
- **Foreign keys**: always enforce referential integrity (DB-level, not just app-level).
- **Composite keys**: only when the tuple is the natural identity; keep it small.
- **UUID vs bigint**: UUID = distributed-safe, larger; bigint = smaller/faster, needs central seq.

## Indexing

- Index foreign-key columns and every column in `WHERE`/`JOIN`/`ORDER BY` hot paths.
- **Compound indexes** ordered by selectivity + equality-before-range.
- Avoid over-indexing: each index costs writes + storage. Measure with `EXPLAIN`.
- Unique constraints double as validation (e.g. one row per user per scope).

## Relationships & types

- One-to-many → FK on the "many" side. Many-to-many → join table with its own PK.
- Choose correct types: `timestamptz` not `timestamp` (store UTC), `numeric` for money (never float),
  `text`/`varchar(n)` per need, `jsonb` for flexible attributes (Postgres).
- Enums: native enum or lookup table; avoid free-text status columns.

## Migration-safe schema design

- Design columns to be **additive** (nullable or defaulted) for zero-downtime evolution.
- Avoid `NOT NULL` without default on existing tables (blocks add). Backfill in steps.
- Keep large table alterations online (Postgres `CONCURRENTLY` for indexes) — see `db-migration-guide.md`.
- Document the model (ERD or short prose) in `docs/`; keep it human-owned.

## Checklist

- [ ] Normalized first; denormalization justified by a measured bottleneck + ADR
- [ ] Surrogate PK; FKs enforced at DB level; no business data as PK
- [ ] Hot-path columns indexed; `EXPLAIN` reviewed; no gratuitous indexes
- [ ] Correct types: `timestamptz` (UTC), `numeric` for money, `jsonb` where apt
- [ ] Relationships modeled correctly (join table for M:N)
- [ ] Additive-friendly columns for safe future migrations
- [ ] Model documented for humans in `docs/`
