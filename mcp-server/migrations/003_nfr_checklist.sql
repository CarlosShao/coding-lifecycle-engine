-- Migration 003: NFR completeness checklist (enterprise-grade dimension coverage)
-- Tracks, per project, which non-functional requirement dimensions the plan has covered.
-- Used by pass_gate(phase_0_5) to hard-block commercial/enterprise projects whose plan
-- skipped required dimensions. mvp is advisory-only (gate not enforced).

CREATE TABLE IF NOT EXISTS nfr_coverage (
    project_id TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    dimension   TEXT    NOT NULL,
    covered     INTEGER NOT NULL DEFAULT 0,   -- 0 = not addressed, 1 = addressed in PRD/tech-plan
    notes       TEXT,
    updated_at  TEXT    NOT NULL,
    PRIMARY KEY (project_id, dimension)
);
