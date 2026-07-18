# Bug Handling Track

> 机制文件 · Bug 兄弟轨道（**不是一条独立生命周期**）。与 feature 平级，复用同一状态机与工具，不重置 `current_phase`。顽固 bug 用 Matt `diagnosing-bugs` 作方法引擎 + `anti-shortcut-workflow` 防假修。

## 1. 定位与边界

- Bug 是 `tasks` 中 `type='bug'` 的节点，是 feature 的**兄弟轨道**，不是 P0→P4 重走。
- 入口多源，但归宿同一状态机：`report_bug` → 诊断循环 → 修复 → 核对 → `complete_task`。
- **绝不**因一个 bug 重置 `current_phase`（违反 §0.3 纪律3"不重启"）。

## 2. 入口（三类 source）

| source | 触发点 | 调用 |
|---|---|---|
| `test_failure` | Phase 2 测试红 / quarantine 升 bug | `report_bug(symptom, severity, source='test_failure')` |
| `review` | Phase 3 对抗验收发现 | `report_bug(..., source='review')` |
| `production` | 运行期/用户反馈 | `report_bug(..., source='production')` |

`severity`：`critical | high | med | low`。生产阻断链路 = critical；核心功能损 = high。

## 3. 节点 Schema（§2.5 扩展字段）

```
tasks.type        = 'bug'
tasks.severity    = critical|high|med|low
tasks.symptom     = 现象描述（可复现步骤）
tasks.hypothesis  = JSON 数组，诊断循环每轮一条假设
tasks.root_cause  = 验证后的根因（修复前填）
tasks.fix_ref     = 修复 PR / commit 引用
tasks.escalate_to = 升级目标（见 §6）
```

## 4. 闭环（不动主流程阶段）

1. **reproduce** — 稳定复现。**无法稳定复现，禁止动手修**（防盲改，见 `flaky-test-protocol.md` 若属偶发先 quarantine）。
2. **diagnosing-bugs 循环** — 假设 → 验证 → 修复 → 复验。**禁止猜**：每轮把假设写入 `hypothesis[]`，用工具/日志/最小复现验证，验证失败换假设，不堆补丁。
3. **修复必须带回归测试** — 防复发；测试覆盖该根因场景。
4. **anti-shortcut 核对** — 强制回答："是否真修根因，还是只压症状？" 仅压症状（如 `catch` 吞错、`sleep` 掩盖竞态、注释掉断言）→ 判 `fail`，退回。
5. **complete_task** — 依赖满足 + 回归测试绿 + anti-shortcut 通过才标 `done`。

## 5. 反糊弄：核对"真修根因"

- 修复 PR 必须能解释**为什么**这次改动消除根因（写入 `fix_ref` 描述 / `progress_log`）。
- 若修复靠"多点乱改碰巧绿"，`anti-shortcut-workflow` 标 `symptom_only_fix` → 拒绝。
- 回归测试须**失败于修复前、绿于修复后**（证明测的是根因，不是顺手）。

## 6. 升级路径（例外，非默认）

若诊断后 `root_cause` = **当初设计 / 契约错误**（不是实现笔误）：

- 置 `escalate_to='phase_1'`，触发：
  - 回 Phase 0.5 grilling 重审（方案层错），或
  - Phase 1 重 `decompose` + `contracts` 版本 +1（接口变更）。
- 受影响 ticket 自动 `blocked`（依赖新契约/新设计）。
- 经 `approvals` 的 `architecture_approval` 门重新签核，新契约 `freeze_contract` 后解禁。
- 这是**唯一**允许 bug 触达早期阶段的路径，且走升级而非静默改。

## 7. 诊断循环停滞 → 上交人类

`diagnosing-bugs` 假设耗尽仍无根因：

- 调 `escalate_to_human(task_id, context_bundle)`，**不**胡乱改代码凑过。
- `context_bundle` 必须含：现象（symptom）、已试假设清单（hypothesis[]）、相关日志/堆栈、最小复现步骤、影响范围。
- 人类接管或给新假设后，循环继续；状态留在 DB，可"继续"。

## 8. 记录与审计

- 每轮假设/验证、根因、fix_ref、escalate_to 全部入 `tasks` 扩展字段 + `events`（tool=`diagnosing-bugs`）。
- 跨会话可见：新会话 `get_state` 能看到进行中 bug 及其诊断进度，不重复踩。
