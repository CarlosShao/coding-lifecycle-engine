# AI Coding Lifecycle

> A **stateful lifecycle engine** that forces an AI coding agent to walk a real product from *idea* to *shippable deliverable* — without cutting corners, faking green tests, or silently restarting.

**English** | [中文](#中文文档)

---

## What is this?

Most AI coding agents are *stateless sprinters*. They enthusiastically write code, declare "done", and forget everything the moment a session ends. Open a new window and the agent has no idea what it built yesterday, which decisions were made, or whether the tests it claimed to pass actually pass.

**AI Coding Lifecycle** fixes this. It is a combination of:

1. **An MCP server** (`mcp-server/`) — a Model Context Protocol server exposing **52 tools** backed by a single SQLite database (`lifecycle.db`). This database is the *single source of truth*: every phase, decision, contract, task, cost record, and NFR coverage flag lives here, persisted across sessions and workspaces.
2. **A SKILL.md orchestration layer** — a detailed playbook that tells the AI agent *how* to drive the lifecycle: when to stop, when to ask the user, when it is forbidden to advance.
3. **42 reference files** (`references/`) — deep-dive guides the agent pulls in on demand (contract design, maturity scoping, NFR dimensions, parallel execution, adversarial acceptance, etc.).

The core insight: **state must live in a database, not in the conversation.** Conversations get truncated, summarized, and forgotten. A database does not. When you switch tasks, close a window, or come back a week later, the lifecycle picks up exactly where it left off.

---

## Why does it exist? (The problems it solves)

| Problem with vanilla AI coding | How the lifecycle solves it |
| --- | --- |
| **"糊弄" — corner-cutting.** Agent writes a stub, calls it done. | Phase gates + adversarial acceptance force real implementation. |
| **"假装通过" — faking green.** Agent claims tests pass without running them. | Phase 3 adversarial acceptance + explicit gate records. |
| **"重启" — silent restart.** New session = agent forgets and rebuilds from scratch. | SQLite single source of truth + resume protocol. |
| **Runaway agent.** Agent blasts through all phases in one shot, no human checkpoint. | Server-level two-step commit gate — stops after every phase. |
| **Lost decisions.** Key architectural decisions vanish when the chat is summarized. | `record_decision` / `save_memory` persist to DB. |
| **Parallel-project confusion.** Multiple projects in flight; "continue" is ambiguous. | `list_projects` enumeration + user selection. |
| **Missing non-functional requirements.** Commercial product ships with no auth/logging/backup. | NFR completeness gate scaled by maturity. |

---

## The 6-phase lifecycle

```
Phase 0    需求 + 方案   Requirements + Solution design
   │
Phase 0.5  ★ Grilling    Adversarial plan review (HARD GATE)
   │
Phase 1    拆分 + 契约冻结  Decomposition + Contract freeze
   │
Phase 2    并行开发       Parallel development
   │
Phase 3    ★ 对抗验收     Adversarial acceptance (HARD GATE)
   │
Phase 4    失败预演 + 交付  Failure rehearsal + Delivery
```

- **Phase 0 — Requirements & Solution.** Capture what is being built and the proposed approach. Maturity is scoped here (MVP / commercial / enterprise), which controls how strict later gates are.
- **Phase 0.5 — Grilling (★ hard gate).** The plan is stress-tested against exhaustive dimensions before a single line of production code is written. Weak plans are sent back.
- **Phase 1 — Decomposition & Contract freeze.** Work is split into tasks; interface contracts between tasks are **frozen**. Changing a frozen contract bumps its version and automatically blocks dependents until they re-align.
- **Phase 2 — Parallel development.** Tasks execute (potentially in parallel), respecting the DAG and frozen contracts. File locks prevent collisions.
- **Phase 3 — Adversarial acceptance (★ hard gate).** Deliverables are attacked, not congratulated. Real tests, real edge cases.
- **Phase 4 — Failure rehearsal & delivery.** Rehearse how it breaks, then hand off.

---

## Three hard disciplines (non-negotiable)

1. **不糊弄 — Don't cut corners.** No stubs masquerading as features.
2. **不假装通过 — Don't fake green.** A gate is only passed with recorded evidence.
3. **不重启 — Don't restart.** Resume from DB state, never rebuild from zero.

---

## Server-level hard gates (enforced in code, not just prose)

These are **real barriers baked into the MCP server**, not soft SOP suggestions the AI can ignore:

- **Two-step commit on `advance_phase`.** The first call only *parks* the transition — it does not advance. The phase only moves forward when the user explicitly confirms (`confirmed_by_user=true` + `user_ack`). This forces a human checkpoint after every phase.
- **Identity hard-lock before Phase 1.** `identity_confirmed=1` is required to enter Phase 1. This flag is set only by `rename_project` or `confirm_identity`. Without it, `advance_phase` fails. (Independent DB flag — a genuinely hard gate.)
- **NFR completeness gate scaled by maturity.** For `commercial` / `enterprise` maturity, `pass_gate(phase_0_5)` requires every dimension in `nfr_coverage` to be marked `covered=1`. MVP is not forced (only advised).

> **Honest boundary:** The two-step commit is a strong barrier but not absolute — an agent could theoretically call `advance_phase` twice in a single turn. The identity lock is genuinely hard (independent DB flag). We document this honestly rather than overselling.

---

## Multi-project & parallel support

All projects share one `lifecycle.db`, isolated by `root_path` / `project_id`.

- **`root_path` is the "household address"** — fixed at `init_project` time. It defines *where the code ultimately lands*, not *which window you are in*. You can switch tasks/workspaces freely; the household does not move.
- **Resume protocol.** In a fresh session, saying "continue" triggers `list_projects()`:
  - **1 active project** → `get_state(project_id)` directly.
  - **Multiple projects** → enumerate them, ask the user which one to resume (structured selection), then `get_state`.
- **Naming.** Start chaotic ideation with a placeholder name (`untitled-{keyword}`), then `rename_project` to the final name once the plan is locked.

---

## Installation & setup

### Prerequisites

- Node.js **>= 18**
- An MCP-capable client (e.g. WorkBuddy, Claude Desktop, or any MCP host)

### 1. Install the MCP server

```bash
cd mcp-server
npm install
```

This builds `better-sqlite3` and installs `@modelcontextprotocol/sdk`.

### 2. Register the server in your MCP config

Add to your MCP host config (e.g. `~/.workbuddy/mcp.json`):

```json
{
  "mcpServers": {
    "ai-coding-lifecycle": {
      "command": "node",
      "args": ["/absolute/path/to/ai-coding-lifecycle/mcp-server/src/index.js"]
    }
  }
}
```

The database is created automatically on first run at the user-level data directory. Migrations (001, 002, 003) run idempotently on import — no manual `ALTER` needed.

### 3. Install the SKILL

Copy or symlink `SKILL.md` into your agent's skills directory so the agent loads the orchestration playbook. The SKILL references files under `references/` on demand.

### 4. Run the tests (optional)

```bash
cd mcp-server
node --test test/smoke.test.mjs
```

Tests use a temporary DB (`AI_LIFECYCLE_DB` env override), so they never pollute your real `lifecycle.db`. Current suite: **22/22 passing, 52 tools**.

---

## Tool catalog (52 tools)

Organized across layered modules under `mcp-server/src/tools/`:

| Module | Responsibility | Example tools |
| --- | --- | --- |
| `project.js` | Project lifecycle, identity, state | `init_project`, `get_state`, `list_projects`, `rename_project`, `confirm_identity`, `reset_project`, `delete_project`, `bootstrap_existing` |
| `dag.js` | Task graph, dependencies, contracts | `decompose`, `get_dag`, `freeze_contract`, `get_contracts`, `check_dependencies` |
| `execution.js` | Task execution & phase control | `claim_task`, `start_task`, `complete_task`, `advance_phase`, `pass_gate`, `get_checklist` |
| `increment.js` | Mid-stream change handling | `classify_change`, `integrate_changes` |
| `conventions.js` | Coding conventions extraction | `get_conventions`, `set_convention` |
| `memory.js` | Cross-session memory | `save_memory`, `search_memory`, `record_decision` |
| `bug.js` | Bug tracking (sibling track) | `report_bug` |
| `approval.js` | Human approvals | `request_approval`, `record_approval` |
| `parallel.js` | File locks for parallel work | `acquire_file_lock`, `release_file_lock`, `check_file_lock` |
| `cost.js` | Token / model cost accounting | `record_cost`, `get_cost`, `route_model` |
| `nfr.js` | Non-functional requirements gate | `get_nfr_checklist`, `set_nfr_coverage` |
| `misc.js` | Escalation & utilities | `escalate_to_human`, `detect_stale` |

Run `list_projects` in any fresh session to see what is resumable.

---

## Project structure

```
ai-coding-lifecycle/
├── SKILL.md                 # Orchestration playbook (the agent reads this)
├── README.md                # This file
├── references/              # 42 deep-dive guides pulled in on demand
├── examples/
│   └── minimal-walkthrough.md
├── scripts/
│   └── extract-conventions.mjs
└── mcp-server/
    ├── src/
    │   ├── index.js         # MCP stdio server entry
    │   ├── db.js            # SQLite + auto migrations
    │   └── tools/           # 12 layered tool modules
    ├── migrations/          # 001, 002, 003 (idempotent)
    ├── test/smoke.test.mjs
    └── package.json
```

---

## License

MIT

---
---

<a name="中文文档"></a>

# AI Coding Lifecycle（中文文档）

> 一套**有状态的生命周期引擎**，强制 AI 编码智能体把一个真实产品从*想法*一路走到*可交付成果*——不糊弄、不假装通过、不偷偷重启。

[English](#ai-coding-lifecycle) | **中文**

---

## 这是什么？

大多数 AI 编码智能体都是*无状态的短跑选手*：热情地写代码、宣布"完成"，然后在会话结束的那一刻忘掉一切。新开一个窗口，智能体完全不知道昨天建了什么、做过哪些决策，也不知道它声称通过的测试到底有没有真的通过。

**AI Coding Lifecycle** 就是来解决这个问题的。它由三部分组成：

1. **一个 MCP 服务器**（`mcp-server/`）——一个 Model Context Protocol 服务器，暴露 **52 个工具**，背后由单一 SQLite 数据库（`lifecycle.db`）支撑。这个数据库就是*唯一事实来源*：每一个阶段、决策、契约、任务、成本记录、NFR 覆盖标记都存在这里，跨会话、跨工作区持久化。
2. **一个 SKILL.md 编排层**——一份详尽的操作手册，告诉 AI *如何*驱动整个生命周期：何时停车、何时问用户、何时被禁止推进。
3. **42 个 reference 文件**（`references/`）——按需拉取的深度指南（契约设计、成熟度定级、NFR 维度、并行执行、对抗验收等）。

核心洞见：**状态必须活在数据库里，而不是对话里。** 对话会被截断、被摘要、被遗忘；数据库不会。当你切换任务、关闭窗口，或者一周后回来，生命周期会精确地从上次停下的地方续跑。

---

## 为什么需要它？（它解决的问题）

| 原生 AI 编码的问题 | 生命周期如何解决 |
| --- | --- |
| **糊弄。** 写个桩就说做完了。 | 阶段门控 + 对抗验收强制真实实现。 |
| **假装通过。** 没跑测试就声称通过。 | Phase 3 对抗验收 + 显式门控记录。 |
| **偷偷重启。** 新会话 = 忘光重建。 | SQLite 唯一事实来源 + 续跑协议。 |
| **失控狂奔。** 一口气冲完所有阶段，无人工检查点。 | Server 级两步提交门控——每个阶段后强制停车。 |
| **决策丢失。** 关键架构决策在对话摘要后消失。 | `record_decision` / `save_memory` 落库。 |
| **并行项目混淆。** 多个项目在跑，"继续"指代不明。 | `list_projects` 枚举 + 用户选择。 |
| **非功能需求缺失。** 商用产品上线却没鉴权/日志/备份。 | 按成熟度缩放的 NFR 完整度门控。 |

---

## 六阶段生命周期

```
Phase 0    需求 + 方案
   │
Phase 0.5  ★ Grilling 拷问   方案对抗式评审（硬门控）
   │
Phase 1    拆分 + 契约冻结
   │
Phase 2    并行开发
   │
Phase 3    ★ 对抗验收        （硬门控）
   │
Phase 4    失败预演 + 交付
```

- **Phase 0 — 需求与方案。** 明确要建什么、拟采用的方案。成熟度在此定级（MVP / 商用 / 企业级），它决定后续门控有多严格。
- **Phase 0.5 — Grilling 拷问（★ 硬门控）。** 在写下第一行生产代码之前，方案要在穷尽式维度上被压力测试。弱方案会被打回。
- **Phase 1 — 拆分与契约冻结。** 工作被拆成任务；任务之间的接口契约被**冻结**。改动已冻结契约会升版，并自动 block 依赖方直到它们重新对齐。
- **Phase 2 — 并行开发。** 任务执行（可并行），遵守 DAG 与冻结契约。文件锁防止冲突。
- **Phase 3 — 对抗验收（★ 硬门控）。** 交付物是被"攻击"而不是被"表扬"。真测试、真边界情况。
- **Phase 4 — 失败预演与交付。** 先预演它怎么坏，再交接。

---

## 三条硬纪律（不可谈判）

1. **不糊弄** —— 不用桩冒充功能。
2. **不假装通过** —— 门控只有在有记录的证据下才算通过。
3. **不重启** —— 从数据库状态续跑，绝不从零重建。

---

## Server 级硬门控（写死在代码里，不是嘴上说说）

这些是**真正焊死在 MCP 服务器里的屏障**，不是 AI 可以无视的软性 SOP 建议：

- **`advance_phase` 两步提交。** 首次调用只*停车*、不推进。只有用户显式确认（`confirmed_by_user=true` + `user_ack`）后阶段才前进。这强制每个阶段后有一个人工检查点。
- **进 Phase 1 前身份硬卡。** 进入 Phase 1 要求 `identity_confirmed=1`。该标志只由 `rename_project` 或 `confirm_identity` 置位。没有它，`advance_phase` 直接 fail。（独立 DB flag——真正的硬门控。）
- **按成熟度缩放的 NFR 完整度门控。** 对 `commercial` / `enterprise` 成熟度，`pass_gate(phase_0_5)` 要求 `nfr_coverage` 每一个维度都标记 `covered=1`。MVP 不强制（仅建议）。

> **诚实边界：** 两步提交是强屏障但非绝对——智能体理论上可以在单轮里连调两次 `advance_phase`。身份硬卡是真硬（独立 DB flag）。我们如实记录，不夸大。

---

## 多项目与并行支持

所有项目共享一个 `lifecycle.db`，通过 `root_path` / `project_id` 隔离。

- **`root_path` 是"户籍地址"** —— 在 `init_project` 时定死，定义*代码最终落到哪里*，而不是*你当前在哪个窗口*。你可以自由切换任务/工作区；户籍不挪。
- **续跑协议。** 新会话里说"继续"会触发 `list_projects()`：
  - **仅 1 个进行中项目** → 直接 `get_state(project_id)`。
  - **多个项目** → 枚举出来，用结构化选择让用户挑要续哪个，再 `get_state`。
- **命名。** 混沌构思期先用占位名（`untitled-{关键词}`），方案定稿后用 `rename_project` 改成正式名。

---

## 安装与配置

### 前置条件

- Node.js **>= 18**
- 一个支持 MCP 的客户端（如 WorkBuddy、Claude Desktop 或任意 MCP host）

### 1. 安装 MCP 服务器

```bash
cd mcp-server
npm install
```

这会编译 `better-sqlite3` 并安装 `@modelcontextprotocol/sdk`。

### 2. 在 MCP 配置中注册服务器

加入你的 MCP host 配置（如 `~/.workbuddy/mcp.json`）：

```json
{
  "mcpServers": {
    "ai-coding-lifecycle": {
      "command": "node",
      "args": ["/绝对路径/ai-coding-lifecycle/mcp-server/src/index.js"]
    }
  }
}
```

数据库在首次运行时自动创建于用户级数据目录。迁移脚本（001、002、003）在 import 时幂等执行——无需手动 `ALTER`。

### 3. 安装 SKILL

把 `SKILL.md` 复制或软链到你智能体的 skills 目录，让智能体加载编排手册。SKILL 会按需引用 `references/` 下的文件。

### 4. 运行测试（可选）

```bash
cd mcp-server
node --test test/smoke.test.mjs
```

测试使用临时数据库（`AI_LIFECYCLE_DB` 环境变量覆盖），绝不污染你真实的 `lifecycle.db`。当前套件：**22/22 通过，52 个工具**。

---

## 工具目录（52 个工具）

按 `mcp-server/src/tools/` 下的分层模块组织：

| 模块 | 职责 | 示例工具 |
| --- | --- | --- |
| `project.js` | 项目生命周期、身份、状态 | `init_project`、`get_state`、`list_projects`、`rename_project`、`confirm_identity`、`reset_project`、`delete_project`、`bootstrap_existing` |
| `dag.js` | 任务图、依赖、契约 | `decompose`、`get_dag`、`freeze_contract`、`get_contracts`、`check_dependencies` |
| `execution.js` | 任务执行与阶段控制 | `claim_task`、`start_task`、`complete_task`、`advance_phase`、`pass_gate`、`get_checklist` |
| `increment.js` | 中途变更处理 | `classify_change`、`integrate_changes` |
| `conventions.js` | 编码规范提取 | `get_conventions`、`set_convention` |
| `memory.js` | 跨会话记忆 | `save_memory`、`search_memory`、`record_decision` |
| `bug.js` | Bug 跟踪（兄弟轨道） | `report_bug` |
| `approval.js` | 人工审批 | `request_approval`、`record_approval` |
| `parallel.js` | 并行工作的文件锁 | `acquire_file_lock`、`release_file_lock`、`check_file_lock` |
| `cost.js` | Token / 模型成本核算 | `record_cost`、`get_cost`、`route_model` |
| `nfr.js` | 非功能需求门控 | `get_nfr_checklist`、`set_nfr_coverage` |
| `misc.js` | 升级与工具 | `escalate_to_human`、`detect_stale` |

在任何新会话里运行 `list_projects` 即可看到有哪些项目可续跑。

---

## 项目结构

```
ai-coding-lifecycle/
├── SKILL.md                 # 编排手册（智能体读它）
├── README.md                # 本文件
├── references/              # 42 个按需拉取的深度指南
├── examples/
│   └── minimal-walkthrough.md
├── scripts/
│   └── extract-conventions.mjs
└── mcp-server/
    ├── src/
    │   ├── index.js         # MCP stdio 服务器入口
    │   ├── db.js            # SQLite + 自动迁移
    │   └── tools/           # 12 个分层工具模块
    ├── migrations/          # 001、002、003（幂等）
    ├── test/smoke.test.mjs
    └── package.json
```

---

## 许可证

MIT
