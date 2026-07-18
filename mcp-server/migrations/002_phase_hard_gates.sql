-- Migration 002: 两道阶段硬门控
--   1) identity_confirmed: Phase 0.5 → Phase 1 前必须确认项目身份(改名/确认目录)
--   2) pending_advance_to: advance_phase 两步提交，强制每个阶段完成后停下等用户确认
-- 说明: SQLite 的 ALTER TABLE ADD COLUMN 幂等性由 db.js 的 migrations 表保证(只跑一次)。

ALTER TABLE projects ADD COLUMN identity_confirmed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN pending_advance_to TEXT;
