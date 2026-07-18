-- Migration 001: initial full schema
-- AI Coding Lifecycle — SQLite schema (single source of truth)
-- Runs once. Future migrations are additive (see db.js migration runner).

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============ 项目级 ============
CREATE TABLE IF NOT EXISTS projects (
    id            TEXT PRIMARY KEY,          -- UUID
    name          TEXT NOT NULL,
    root_path     TEXT NOT NULL UNIQUE,
    project_type  TEXT NOT NULL DEFAULT 'greenfield', -- greenfield|existing_clean|existing_legacy|existing_active
    maturity      TEXT NOT NULL DEFAULT 'mvp', -- mvp|commercial|enterprise
    current_phase TEXT NOT NULL DEFAULT 'phase_0',
    stack         TEXT,                      -- JSON: 冻结的技术栈选型
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

-- ============ 阶段状态 ============
CREATE TABLE IF NOT EXISTS phases (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase_key   TEXT NOT NULL,               -- phase_0/0_5/1/2/3/4
    status      TEXT NOT NULL DEFAULT 'pending', -- pending|active|done|skipped
    gate_passed INTEGER NOT NULL DEFAULT 0,  -- 门控是否通过(如 grilling 锁定)
    artifacts   TEXT,                        -- JSON: 该阶段产物路径清单
    started_at  TEXT,
    completed_at TEXT,
    UNIQUE(project_id, phase_key)
);

-- ============ 工作项 (增量需求单元) ============
CREATE TABLE IF NOT EXISTS work_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'initial', -- initial|increment
    change_class TEXT,                        -- full|compressed (增量分类)
    prd_fragment TEXT,                        -- 需求片段
    status      TEXT NOT NULL DEFAULT 'active',
    created_at  TEXT NOT NULL
);

-- ============ 任务 DAG 节点 (递归 WBS) ============
CREATE TABLE IF NOT EXISTS tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    work_item_id  INTEGER REFERENCES work_items(id) ON DELETE CASCADE,
    parent_id     INTEGER REFERENCES tasks(id) ON DELETE CASCADE, -- 递归分解
    type          TEXT NOT NULL DEFAULT 'atomic_task', -- module|atomic_task|bug|refactor|upgrade|docs|spike
    title         TEXT NOT NULL,
    description   TEXT,
    status        TEXT NOT NULL DEFAULT 'todo', -- todo|in_progress|blocked|review|done|abandoned|superseded
    owner_session TEXT,
    module        TEXT,
    language      TEXT,
    framework     TEXT,
    convention_id INTEGER REFERENCES conventions(id) ON DELETE SET NULL,
    dod           TEXT,                        -- JSON: Definition of Done 清单
    test_spec     TEXT,                        -- JSON: 测试要求
    acceptance_criteria TEXT,                 -- 验收标准(继承 PRD 可细化)
    nfr          TEXT,                         -- 非功能要求: 延迟/内存/吞吐
    progress_log TEXT,                         -- 叙事进度(文章外部记忆纪律)
    severity     TEXT,                         -- bug 专用: critical/high/med/low
    symptom      TEXT,                         -- bug 现象
    hypothesis   TEXT,                         -- JSON 数组: 诊断循环每轮假设
    root_cause   TEXT,                         -- bug 根因(验证后填)
    fix_ref      TEXT,                         -- bug 修复 PR/commit
    escalate_to  TEXT,                         -- bug 升级目标: phase_1 | human
    estimate     TEXT,                         -- 粒度自检结果
    actual       TEXT,
    claimed_at   TEXT,
    completed_at TEXT,
    created_at   TEXT NOT NULL
);

-- ============ 依赖边 (DAG) ============
CREATE TABLE IF NOT EXISTS task_dependencies (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id            INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    edge_type          TEXT NOT NULL DEFAULT 'depends_on', -- depends_on|blocks
    UNIQUE(task_id, depends_on_task_id)
);

-- ============ 冻结契约 (递归, 模块间接口) ============
CREATE TABLE IF NOT EXISTS contracts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    provider_module TEXT NOT NULL,
    consumer_module TEXT NOT NULL,
    interface_spec TEXT NOT NULL,             -- 接口定义(OpenAPI/TS types/proto)
    version        INTEGER NOT NULL DEFAULT 1,
    status         TEXT NOT NULL DEFAULT 'frozen', -- frozen|proposed|deprecated
    frozen_at      TEXT NOT NULL
);

-- ============ 规范 (按语言+框架+模块) ============
CREATE TABLE IF NOT EXISTS conventions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    language        TEXT NOT NULL,
    framework       TEXT,
    module          TEXT,                     -- NULL=项目级默认, 有值=模块级覆盖
    formatter       TEXT,
    linter          TEXT,
    lint_rules      TEXT,                     -- JSON
    test_framework  TEXT,
    coverage_threshold REAL DEFAULT 80.0,
    naming_rules    TEXT,                     -- JSON
    quality_rules   TEXT,                     -- JSON: 代码质量规则
    max_file_lines  INTEGER DEFAULT 300,
    max_function_lines INTEGER DEFAULT 40,
    max_params      INTEGER DEFAULT 4,
    max_nesting     INTEGER DEFAULT 4,
    is_default_heuristic INTEGER DEFAULT 1,   -- 1=默认启发式可覆盖, 0=项目硬约束
    spec_ref        TEXT,
    created_at      TEXT NOT NULL
);

-- ============ 决策记录 (ADR-lite) ============
CREATE TABLE IF NOT EXISTS decisions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id      INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'accepted', -- proposed|accepted|superseded
    context      TEXT NOT NULL,
    decision     TEXT NOT NULL,
    consequences TEXT,
    created_at   TEXT NOT NULL
);

-- ============ 阻塞记录 ============
CREATE TABLE IF NOT EXISTS blocks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    reason      TEXT NOT NULL,
    blocked_by  TEXT NOT NULL,                -- external:<dep>|task:<id>|waiting:user
    workaround  TEXT,                          -- 本地推进方式(mock/stub)
    created_at  TEXT NOT NULL,
    resolved_at TEXT
);

-- ============ 跨会话记忆 ============
CREATE TABLE IF NOT EXISTS memory (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category    TEXT NOT NULL,                -- lesson|preference|env|observation
    key         TEXT NOT NULL,
    value       TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

-- ============ 事件日志 (审计) ============
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session     TEXT,
    tool        TEXT NOT NULL,
    payload     TEXT,                         -- JSON
    created_at  TEXT NOT NULL
);

-- ============ 文件级锁 (并行 agents 共享文件) ============
CREATE TABLE IF NOT EXISTS file_locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    owner_session TEXT NOT NULL,
    acquired_at TEXT NOT NULL,
    UNIQUE(file_path)
);

-- ============ 审批/门控 (人类签核) ============
CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    gate TEXT NOT NULL,            -- stack_approval|architecture_approval|release_signoff|ticket_review
    target_id TEXT,                -- task_id 或 project_id
    state TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|rejected
    approver TEXT,
    decided_at TEXT,
    note TEXT
);

-- ============ 成本台账 (token/费用) ============
CREATE TABLE IF NOT EXISTS cost_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    session TEXT,
    model TEXT,
    tokens_in INTEGER,
    tokens_out INTEGER,
    cost_usd REAL,
    created_at TEXT NOT NULL
);

-- ============ schema 版本 (迁移 runner) ============
CREATE TABLE IF NOT EXISTS migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

-- ============ 索引 ============
CREATE INDEX IF NOT EXISTS idx_tasks_status  ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_owner   ON tasks(owner_session);
CREATE INDEX IF NOT EXISTS idx_deps_task     ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_blocks_task   ON blocks(task_id, resolved_at);
CREATE INDEX IF NOT EXISTS idx_tasks_proj    ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_phases_proj   ON phases(project_id);
CREATE INDEX IF NOT EXISTS idx_conventions_proj ON conventions(project_id);
