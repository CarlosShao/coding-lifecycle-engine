# Human Approval Model

> 机制文件 · 谁在何时对人类签核负责。本系统**不替人类做发布决策**，只把客观达标清单交付给人类，由人类拍板。

## 1. 四道审批门（Gates）

审批门写入 `approvals` 表（`gate`, `target_id`, `state`, `approver`, `decided_at`, `note`）。`state` 为 `pending|approved|rejected`。任一前置审批未 `approved`，对应的 `advance_phase` / `handoff` 被 server 拒绝。

| Gate | 触发阶段 | 默认目标 | 签核内容 | 缺省时禁止的动作 |
|---|---|---|---|---|
| `stack_approval` | Phase 0 → 0.5 边界 | `set_stack` 落定的技术栈 JSON | 栈选型（语言/框架/依赖/存储/部署目标） | 进入 grilling 后不得再改栈 |
| `architecture_approval` | Phase 1 → 2 边界 | 冻结契约集合 + DAG | 模块拆分、模块间接口、依赖方向 | 并行开发启动 |
| `ticket_review` | 每票 `complete_task` 前（可选） | 单个 task | 该任务交付是否符合 DoD + ticket | 任务标 `done`（仅在严格档强制） |
| `release_signoff` | Phase 4 → handoff | 整个 project | 发布达标清单全绿（见 §4） | `handoff` 交付动作 |

## 2. 默认档 vs 严格档

档位由 `maturity-scoping.md` 按 `projects.maturity` 选择，写入 `set_convention` 或项目配置。

| Gate | 默认档（mvp / 单人快速） | 严格档（commercial / enterprise） |
|---|---|---|
| `stack_approval` | 异步：系统给出选型清单，用户可事后追认 | 同步阻塞：必须显式批准才进 0.5 |
| `architecture_approval` | 异步：契约冻结后记录，用户可事后追认 | 同步阻塞：必须显式批准才进 Phase 2 |
| `ticket_review` | **关闭**（仅关键任务可选开启） | **开启**（每票完成需人工 review） |
| `release_signoff` | 同步阻塞（发布必须确认） | 同步阻塞 + 需双人 sign-off 记录 |

> 严格档可在任意任务通过 `request_approval(gate='ticket_review', target_id=<id>)` 临时提升单票要求，不影响全局档位。

## 3. 流程：request_approval / record_approval

- **`request_approval(gate, target_id)`**：server 插入 `approvals` 行 `state='pending'`，返回"等待签核"信号。系统**不阻塞**思考，但被禁动作（如 `handoff`）会在调用时返回 `BLOCKED_BY_APPROVAL`。
- **`record_approval(gate, target_id, state, approver, note)`**：人类（或代表人类的 agent 经授权）写入结果。
  - `approved` → 解除对应阻塞，允许进阶。
  - `rejected` → 记录 `note`，相关阶段回退为 `active` 待修，不静默绕过。

系统**不得**自动把 `pending` 改写为 `approved`——即使用户在对话中说"行了吧"，也必须走 `record_approval` 显式落库，保证审计链完整。

## 4. 谁决定"可发布"

**默认是用户，不是系统。**

系统在 `release_signoff` 处只提供一份**客观达标清单**（不投票、不替用户判断）：

```yaml
release_readiness_checklist:
  - all_tasks_done: true            # DAG 全 done
  - blocked_zero: true              # blocks 表无未解阻塞
  - quality_gates: pass             # anti-shortcut 全通过（有工具证据）
  - spec_conformance: pass          # recheck_conformance 无漂移
  - nfr_met: true                   # performance-budget 达标
  - tests_green: true               # 含 quarantine 之外的全部测试
  - cost_within_budget: true        # cost_ledger 未超阈
  - security_scan: pass             # 依赖扫描无 critical
```

清单全绿 ≠ 自动发布。系统把清单交还用户："以上 8 项全部达标，是否 sign-off 发布？" 用户调用 `record_approval(gate='release_signoff', state='approved')` 后，`handoff` 才放行。

## 5. 审批的不可逆与例外

- 否决后再次提交需新的 `request_approval`；旧记录保留为 `rejected` 审计。
- 紧急热修可走压缩生命周期，但 `release_signoff` **永不免除**（发布是人类主权）。
- 升级类审批（`escalate_to='phase_1'` 触发的契约重冻）同样落入 `architecture_approval` 门，不旁路。
