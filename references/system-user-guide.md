# System User Guide

> 机制文件 · 人类如何驾驶本系统。本系统是**元工具（meta-tool）**：它调度 Matt 11 技能、注入 reference 知识库、经 MCP server 维护状态，自己不写产品代码。

## 1. 系统是什么 / 不是什么

- **是**：一个有状态 MCP server（真相源 `lifecycle.db`）+ 一个薄 skill（流程叙述 + 燃料注入）+ 一组 reference（规范库）。
- **不是**：一个会替你写功能的聊天机器人。它编排、约束、记录；具体执行交给 Matt 引擎（`to-spec` / `codebase-design` / `implement` / `tdd` / `code-review` / `diagnosing-bugs` / `handoff`）+ `grilling` + `anti-shortcut-workflow`。
- 设计原则（§0.3）：不糊弄、不假装通过、不重启。

## 2. 如何调用本系统

- MCP server 注册于 `~/.workbuddy/mcp.json`，常驻进程持有 `lifecycle.db`。
- 在 WorkBuddy 对话中调用 skill：`/ai-coding-lifecycle`（或在支持的入口直接触发）。
- 一句话启动新项目：*"用 ai-coding-lifecycle 做一个 <你的想法>"* → 系统 `init_project` + 进 Phase 0。

## 3. "继续" 的精确含义

"继续" **不是** 让模型凭记忆猜下一步，而是：

```
用户说"继续"
  → get_state(project_id)
  → 读 current_phase + 各阶段 status + 进行中任务 + 阻塞项
  → 从记录的阶段精确续跑（不重置、不重来）
```

- 状态全在 `lifecycle.db`，进程崩了重启读 DB 即恢复（§12.1 RK1）。新会话说"继续"和老会话断点续跑**行为一致**。
- 系统每次回显："当前 Phase X，下一步是 Y，说'继续'即可。"

## 4. 状态查询

| 意图 | 调用 | 返回 |
|---|---|---|
| 我现在在哪 | `get_state` | 当前阶段、各阶段状态、进行中任务、阻塞项 |
| 下一步做什么 | `get_next(session)` | 依赖已满足、未认领的推荐任务 |
| 任务进度 | `get_progress_log(task_id)` | 该任务叙事进度（每小项追加） |
| 成本 | `get_cost(project_id)` | 累计 token/费用 vs 预算 |
| 契约一致性 | `recheck_conformance(project_id)` | DB 约定 vs 实际代码是否漂移 |

## 5. 中止 / 回滚 / 暂停

| 意图 | 动作 | 说明 |
|---|---|---|
| 暂停 | 直接停对话 | 状态已落库，随时可"继续" |
| 中止当前任务 | `block_task(task_id, reason, blocked_by, workaround)` | 记阻塞，不假装通过；交付前须清零 |
| 放弃工作项 | `abandon_work_item(task_id, reason)` | 标 `abandoned`/`superseded`，清理依赖边 |
| 回滚契约/迁移前 | `checkpoint_create` 或 `escalate_to='phase_1'` | 风险操作前 checkpoint（§16.8） |
| 陈旧确认 | `detect_stale` → 用户确认 | `updated_at` 超龄标 stale，续跑前需确认，防基于过期状态乱继续 |
| 升级给人 | `escalate_to_human(task_id, context_bundle)` | 诊断循环耗尽或需人工决策时上交完整上下文 |

## 6. 状态存哪

- 真相源：`<target-workspace>/.ai-coding/lifecycle.db`（WAL 模式）。
- 伴随 `lifecycle.db-wal` 与 `backups/`（定期备份）。
- 多会话 = 多 server 进程共享同一 SQLite 文件（状态在文件不在进程），经 WAL 串行写（§12.1 RK4, §16.12）。
- reference 知识库在 `ai-coding-lifecycle/references/`，被 skill 按需注入，不进长上下文（§10 分层注入）。
