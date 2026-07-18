---
name: ai-coding-lifecycle
description: >-
  有状态的 AI Coding 生命周期系统（元工具）。当一个从 0 到可交付产品的完整流程需要被强制走通时触发：
  需求→方案打磨(grilling 硬门控)→拆分+契约冻结→并行开发→对抗验收→失败预演+交付。
  中途新需求走压缩生命周期（不重启阶段）。Bug 走兄弟轨道（不重置阶段）。
  本 skill 是「薄胶水」：它编排流程、注入知识库、经 MCP server 维护真相源（lifecycle.db），
  具体写码/测试/审查/调试全部交给 Matt 11 技能 + grilling + anti-shortcut-workflow。
  触发词："/ai-coding-lifecycle"、"用 ai-coding-lifecycle 做…"、"按生命周期开发"、"走完整流程"。
---

# AI Coding Lifecycle — 编排层（SKILL.md）

> 你不是这个系统的实现者，你是它的**驾驶员**。下面的规则是「怎么开」，不是「怎么造」。
> 造的部分在 `mcp-server/`：一个有状态的 MCP server，持有 SQLite 真相源 `lifecycle.db`。

## 0. 三条不可妥协的纪律（违反即失败）

1. **不糊弄**（§0.3-1）：验收阶段强制 `anti-shortcut-workflow` 逐条核对 checklist + 工具证据 + 对比报告。禁止「基本完成 / 大概可以 / 应该没问题」话术。没有工具证据 = 没做。
2. **不假装通过**（§0.3-2）：外部依赖阻塞时，`mock 通过` 绝不写成 `集成通过`。`block_task` 记 `blocked`，对所有会话可见，交付前必须清零或显式 `record_approval` 豁免。
3. **不重启**（§0.3-3）：中途新需求**绝不重置 `current_phase`**，只新建 WorkItem 融入现有 DAG（压缩生命周期）。Bug 也绝不重置阶段。

## 1. 系统是什么 / 不是什么

- **是**：MCP server（真相源 `lifecycle.db`）+ 本 SKILL（流程叙述 + 燃料注入）+ `references/`（规范库）。
- **不是**：替你写功能的聊天机器人。具体执行 = Matt 11 技能（`to-spec` / `codebase-design` / `to-tickets` / `implement` / `tdd` / `code-review` / `diagnosing-bugs` / `research` / `handoff` / `grilling` / `anti-shortcut-workflow` 等）。

四层职责边界（严格）：

| 层 | 管什么 | 不管什么 |
|---|---|---|
| 知识源文档 | 人类可读架构知识 | 项目实时状态 |
| references/ | 机器可消费规范 / checklist / 质量规则 | 状态、约束执行 |
| MCP server | 任务图 / 依赖 / 契约 / 规范实例 / 阻塞 / 决策 — **事实与约束** | 「怎么把事做成」 |
| 本 SKILL | 流程编排 / 燃料注入 / 调度引擎 — **怎么做** | 持久状态（交给 server） |
| Matt / 燃料技能 | 具体执行（写码 / 测试 / 审查 / 调试） | 编排、状态 |

**进程模型**：多会话 = 多 server 进程共享同一个 `lifecycle.db` 文件（WAL 串行写）。状态在**文件**，不在进程。进程崩了，重启读 DB 即恢复（§12.1 RK1）。

## 2. 启动一个项目（Phase 0 入口）

无论用户说「用 ai-coding-lifecycle 做一个 <想法>」还是直接触发本 skill：

```
0.0 确认项目身份（⚠️ 必须在 init_project 之前，不可跳过）
    - AI 根据用户想法，生成 3-5 个候选项目名（kebab-case）+ 建议的 root_path
    - 通过 AskUserQuestion 让用户选择或自填：
        * 项目叫什么？（从 AI 推荐中选 / 自填）
        * 代码落在哪个绝对目录？（root_path）
          → 若当前 task 的 workspace 就是目标项目目录：提议 root_path = 该 workspace 绝对路径
          → 否则请用户给出（目录可尚未创建）
    - 用户拍板后，才调 init_project(name, root_path, ...)
    - ⚠️ root_path 定死后只能通过 rename_project 改；禁止 AI 自作主张默认值

1. route_model(phase='phase_0')                    # 默认 cheap，但 PRD/方案阶段可 cheap
2. init_project(name, root_path, project_type, maturity)
   - project_type: greenfield | existing_clean | existing_legacy | existing_active
   - maturity:     mvp | commercial | enterprise  （决定审批档位与范围裁剪）
   - 已有代码库用 bootstrap_existing（existing_legacy 必带 respect_or_refactor=respect|refactor|pending）
3. 进入 Phase 0（见下）
```

### 关于临时名占位

如果用户在想法混沌阶段无法确定最终名称：
- 先用临时名 `untitled-{关键词}` + 临时 root_path 做 `init_project`（DB 有记录即可挂后续所有状态）
- 方案定稿后（Phase 0.5 grilling 过后），AI 再生成正式候选名 → AskUserQuestion 选定 → `rename_project(project_id, new_name, new_root_path)`
- 此时用户需确保新 root_path 对应的物理目录已创建（或由 AI 提醒创建）

**核心原则：init_project 只是为了"有户籍"，名字可以后面改——但改名的唯一途径是 rename_project 工具。**

- 状态永远先落库，再回话。任何一步异常，先 `get_state` 看真相源，不要凭记忆猜。
- `existing_legacy` 模式：先决定「尊重现有模式」还是「顺手重构」，记入 `record_decision`，**不默许乱改风格**（§16.9）。

## 3. 六阶段生命周期（含门控与状态机）

```
Phase 0 ──► Phase 0.5 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4
需求+方案    grilling★    拆分+契约   并行开发    对抗验收★    预演+交付
            (硬门控)      冻结         (全票)     (不糊弄)    (不重启)
```

- 阶段推进**只能**逐步 + 前置 `gate_passed=1`：`advance_phase(target_phase)` 会校验「目标=当前下一阶段」且「前置 gate 已通过」，否则拒绝。
- **★每个阶段完成后强制停车★（server 两步提交，写死）**：`advance_phase` 默认（不带 `confirmed_by_user`）**只置 pending、不推进**，返回“停车”指令。你**必须**结束本轮 → 向用户汇报本阶段成果 → `AskUserQuestion` 问「是否进入下一阶段」→ 用户明确说继续后，才带 `confirmed_by_user=true` + `user_ack='<用户原话>'` 再调一次真正推进。**严禁在同一轮自己 confirm 冲过去**——这是你反复强调的“不能框框自己往前猛干”。
- **★身份硬卡★（server 写死）**：`advance_phase(target='phase_1')` 要求 `identity_confirmed=1`，否则直接拒绝。置 1 的唯一途径：0.5.4 的 `rename_project`（改名）或 `confirm_identity`（不改名确认）。
- 每次阶段切换后回显：`当前 Phase X，下一步是 Y。本阶段成果：… 是否进入 Y？`（等用户确认，不自动走）

### Phase 0 — 需求与初始方案

| 步骤 | 动作 | 工具 / 引擎 | 注入 reference |
|---|---|---|---|
| 0.1 | 产 PRD | `to-spec` | `prd-prompt.md` + `first-principles.md` + **`maturity-scoping.md`（按 `maturity` 档位展开企业级维度清单）** |
| 0.2 | 技术方案 + 栈选型草案 | `codebase-design`（existing 先读现状）+ `to-spec` 细化 | `tech-plan-prompt.md` + `first-principles.md` + `stack-decision.md` + `skeleton-template.md` |
| 0.3 | 落定技术栈（冻结前可改） | `set_stack(stack_json)` | — |
| 0.4 | 写外部记忆纪律 | 每完成一小项 `add_progress_log` | `plan-doc-discipline.md` |
| 0.4.5 | **填企业级 NFR 覆盖清单（按档位缩放）** | `get_nfr_checklist(project_id)` 看该档位必覆盖维度 → 在 PRD/技术方案落实每条 → `set_nfr_coverage(project_id, dimension, covered=true, notes)` 标记 | 清单维度各自指向对应 reference（见 `maturity-scoping.md` §NFR） |

产物：PRD + 初始技术方案 + 栈选型草案 + NFR 覆盖清单。
门控：**无**（直接进入 0.5）。但 **commercial/enterprise 在 0.5 门控(`pass_gate(phase_0_5)`)前必须 NFR 全覆盖**，否则 server 直接 `fail`（见 §5 下方说明）。mvp 仅建议展示、不强制。

### Phase 0.5 — Grilling 打磨 ★硬门控★（§16.3 stack_approval 亦可在此）

| 步骤 | 动作 | 工具 / 引擎 |
|---|---|---|
| 0.5.1 | 反复对话压力测试方案 | `grilling`（多轮，设轮次软上限，超了提示用户「接受当前 or 明确保留项」，防卡死 HP8） |
| 0.5.2 | 用户明确「方案锁定」→ 写证据 | `pass_gate(phase_key='phase_0_5', evidence='用户锁定信号')` |
| 0.5.3 | （可选）栈选型需人类追认 | `request_approval(gate='stack_approval')` → 用户 `record_approval(..., state='approved')` |
| 0.5.4 | **确认最终项目身份（改名 / 确认目录）★必须★** | 若 init 时用了临时名 `untitled-xxx`：AI 生成 3-5 个 kebab-case 正式候选名 + 建议路径 → **AskUserQuestion 让用户选定** → `rename_project(project_id, new_name, new_root_path)`（自动置 `identity_confirmed=1`）<br>若 init 时已用正式名：仍需 **AskUserQuestion 确认**「name 和 root_path 是否不变」→ 用户确认不变 → 调 `confirm_identity(project_id)` 置位<br>⚠️ **未置 `identity_confirmed=1` 时 server 会拒绝 advance_phase(phase_1)，绕不过去** |

门控（**三道，全部 server 写死**）：
1. **未 `pass_gate(phase_0_5)`（grilling 锁定）绝不能进 Phase 1** —— server 校验 `gate_passed=1`。
2. **`identity_confirmed≠1` 绝不能进 Phase 1** —— 必须先 0.5.4 `rename_project` / `confirm_identity`。
3. **两步提交停车** —— 第一次 `advance_phase` 只停车不推进，须用户 `confirmed_by_user` 才走。

**NFR 完整度门控（按 `maturity` 缩放，叠加在门控 1 上）**：`pass_gate(phase_0_5)` 时，若 `maturity='commercial'/'enterprise'`，server 校验 `nfr_coverage` 中该档位**全部必覆盖维度 `covered=1`**，缺任意一项直接 `fail`，返回缺失维度清单（含 label + 对应 reference）。这把"企业级该考虑的维度"从 P3/P4 的晚补救**前移到规划门控**，杜绝挤牙膏。`mvp` 不强制（清单仅建议）。维度定义见 `maturity-scoping.md` §NFR，工具见 §12 `get_nfr_checklist` / `set_nfr_coverage`。

### Phase 1 — 拆分与契约冻结

| 步骤 | 动作 | 工具 / 引擎 | 注入 reference |
|---|---|---|---|
| 1.1 | 粗票 → 递归拆到原子 | `to-tickets` 出粗票 → `decompose(nodes[])` + `check_atomicity(task_id)` 把关 | `plan-doc-discipline.md` |
| 1.2 | 冻结所有模块间接口 | `freeze_contract(provider, consumer, interface_spec)`（**并行前必须先冻结**）。**升版保护**：同对 (provider,consumer) 再 freeze 即视为版本升级，自动 `blocked` provider+consumer 两侧在途任务，防对着旧契约写 | `api-versioning.md` |
| 1.3 | 每模块绑定语言 + 框架 + 质量规则 | `set_convention(project_id, language, module, ...)`（从 `conventions-index.json` 取默认） | `code-quality-rules.md` + `conventions-index.json` |
| 1.4 | 建部署 / 运维计划骨架 | — | `ops-checklist.md` + `deploy-checklist.md` |
| 1.5 | （可选 / 严格档）架构签核 | `request_approval(gate='architecture_approval')` | `human-approval-model.md` |

**原子判据（check_atomicity 三条硬判据）**：① 单会话可完成且无需再设计架构 ② 接口可对兄弟节点表达（有 `acceptance_criteria` 或 `dod`）③ 有明确 DoD。有子节点必然是 module/feature，需继续拆。
产物：完整 DAG + 冻结契约 + 每模块规范。
门控：**契约必须全部 `frozen` 才能进 Phase 2**（§16.4）。

### Phase 2 — 并行开发

| 步骤 | 动作 | 工具 / 引擎 | 注入 reference |
|---|---|---|---|
| 2.1 | 取下一个可做任务 | `get_next(session)`（依赖已满足 + 未认领） | — |
| 2.2 | 认领（加锁） | `claim_task(task_id, session)`（已被认领 → 拒） | — |
| 2.3 | 查前置（跨会话提醒） | `check_dependencies(task_id)` | — |
| 2.4 | 开工，拿该任务规范 + 契约 + DoD | `start_task(task_id)`（依赖全 done 才允许） | — |
| 2.4b | 写码中**反复回看**契约（不打扰任务状态） | `get_contracts(project_id, module='<本模块>', role='consumer')` 只读拉取该模块该遵守的全部 frozen 契约 | — |
| 2.5 | **写码前注入**（分层·轻） | `get_conventions(task_id, scope='core')` → ≤15 条核心质量规则 + 该模块 `contracts` + DoD | `code-quality-rules.md` 子集 |
| 2.6 | 实现 + 测试 | `implement` + `tdd`（子 agent 并行：每 agent 拥有不相交模块） | `error-handling-patterns.md` + `logging-standards.md` + `testing-requirements.md` |
| 2.7 | 写前/提交前按需加载（分层·中） | 需要时 `get_conventions(..., scope='full')` 或读对应 reference 片段 | 按需 |
| 2.8 | 完成（需证据） | `complete_task(task_id, evidence)`（依赖全 done + DoD 全满足 + 测试证据） | — |
| 2.9 | 共享文件写前锁 | `acquire_file_lock(file)` → 写 → `release_file_lock(file)` | `parallel-integration.md` |

**并行三约束**（§12.2 HP6 / §16.4）：① 契约先于并行冻结 ② 模块所有权不重叠（同一模块内任务由同一 session 顺序完成）③ 共享接口写 `contracts` ④ 并行后有集成步。
门控：**全票 done 才进 Phase 3**。集成步见 §7。

### Phase 3 — 对抗验收 ★不糊弄★

| 步骤 | 动作 | 工具 / 引擎 | 注入 reference |
|---|---|---|---|
| 3.1 | 对抗性审查（5 角色） | `code-review` 切 adversarial 模式 | `adversarial-review.md`（恶意用户 / 安全 / 测试 / 性能 / 挑剔用户） |
| 3.2 | 逐条核查（有工具证据） | `anti-shortcut-workflow` | `code-quality-rules.md` + `testing-requirements.md` + `pr-review-checklist.md` + `security-baseline.md` |
| 3.3 | 有 bug → 兄弟轨道 | `report_bug(...)` → 走 §6 诊断循环 | `bug-handling-track.md` |
| 3.4 | 验收时全量核对（分层·全） | `get_checklist(kind)` 逐类 + `recheck_conformance(project_id)` | `spec-conformance-check.md` |

门控：**所有 checklist 项通过（有工具证据）才进 Phase 4**。
**弱模型降级**（§16.5）：若当前模型做不了 adversarial 多角色，降级为结构化 checklist（五角色拆成固定问题模板），**不跳过验收**。

### Phase 4 — 失败预演与交付

| 步骤 | 动作 | 工具 / 引擎 | 注入 reference |
|---|---|---|---|
| 4.1 | 失败预演（三个月后失效最可能原因，按概率排序） | `pre-mortem.md` 引导 | `pre-mortem.md` |
| 4.2 | 部署 / 运维 checklist 核对 | 逐项 | `deploy-checklist.md` + `ops-checklist.md` + `backup-strategy.md` + `observability-minimal.md` + `changelog-release.md` |
| 4.3 | 发布达标清单 | `get_state` + `get_cost` + `recheck_conformance` 汇总 8 项 | `human-approval-model.md` §4 |
| 4.4 | 人类签核（发布是人类主权） | `request_approval(gate='release_signoff')` → 用户 `record_approval(state='approved')` → `handoff` | — |

产物：可交付产品 + 交付文档 + 预演风险清单。
**release_signoff 永不免除**（即使压缩热修，§16.3 §5）。未 approved，`handoff` 应被拒。

## 4. Resume 协议（"继续" 的精确含义）

"继续" **不是**让模型凭记忆猜下一步：

```
用户说"继续" / 新会话打开
  → list_projects() 枚举 DB 中所有项目
  → 只有 1 个 → 直接 get_state(project_id)
  → 多个并行项目 → AskUserQuestion 让用户选要续哪个（绝不让 AI 瞎猜）
  → get_state(project_id)
  → 读 current_phase + 各阶段 status(gate_passed) + 进行中任务(in_progress) + 阻塞项(blocks)
  → 从记录的阶段精确续跑（不重置、不重来）
  → 若 updated_at 超龄：detect_stale(project_id) → 提示用户确认真实进度，防基于过期状态乱继续
```

- 状态全在 `lifecycle.db`。新会话说"继续"和老会话断点续跑**行为一致**。
- 每次回显："当前 Phase X，下一步是 Y，说'继续'即可。"

## 5. 压缩生命周期（中途新增需求，§5）

中途新需求**绝不重置阶段**，只融入现有 DAG。

```
1. classify_change(project_id, description)
   - 重度信号(新模块/schema变更/改鉴权/影响多模块) → full_lifecycle
   - 轻度信号(纯UI微调/给已有API加字段/小修复)   → compressed
   - 信号不确定 → 保守归 full（HP7）
2. add_work_item(project_id, title, prd_fragment, change_class)   # 不改全局 PRD
3. merge_tickets(work_item_id, tasks[])                            # 并入现有 DAG
   - 新任务 depends_on 未完成任务 → 自动 blocked（依赖保护）
   - 已完成任务不受影响
4. 受影响部分重跑：mini-P0(写片段) → 仅非平凡变更 mini-grilling → 受影响 P2/P3 → 跳过 P4（除非影响架构）
```

隔离保证：DAG 天然支持增量融入，不用重启（§5.3）。

## 6. Bug 处理轨道（兄弟轨道，非独立生命周期，§16.1）

Bug 是 `tasks` 中 `type='bug'` 节点，与 feature 平级，复用同一状态机，**不重置 `current_phase`**。

```
入口（多源）:
  - Phase 2 测试失败   → report_bug(source='test_failure')
  - Phase 3 对抗发现   → report_bug(source='review')
  - 生产/运行期反馈    → report_bug(source='production')
闭环（不动主流程阶段）:
  1. reproduce  — 稳定复现。无法复现禁止动手修（属偶发先 quarantine，见 flaky-test-protocol.md）
  2. diagnosing-bugs 循环 — 假设→验证→修复→复验。"禁止猜"：每轮假设写入 hypothesis[]，用工具验证
  3. 修复必须带回归测试（防复发；测的是根因，非顺手）
  4. anti-shortcut 核对 "是否真修根因，还是只压症状"（catch 吞错/sleep 掩盖/注释断言 → fail 退回）
  5. complete_task(task_id, evidence)  — 依赖满足 + 回归测试绿 + anti-shortcut 通过才 done
```

- **升级路径（例外）**：若 `root_cause` = 当初设计/契约错误 → 置 `escalate_to='phase_1'`，回 0.5 grilling 重审或 Phase 1 重 decompose + contracts 版本 +1，受影响 ticket 自动 blocked，经 `architecture_approval` 门重签核（§16.1/§16.4）。
- **诊断停滞**：假设耗尽仍无根因 → `escalate_to_human(task_id, context_bundle)` 上交完整上下文（现象/已试假设/日志/最小复现），**不胡乱改代码凑过**。

## 7. 并行执行机械细节（§16.4）

- **模块所有权不重叠**：每 `atomic_task` 归属单一 `module`，认领 session 独占该模块。`claim_task` 加锁：已被认领 → 拒。
- **共享文件锁**：路由注册 / 共享类型 / 入口 / 全局配置不归任何模块，写前 `acquire_file_lock`，写完立即 `release_file_lock`。冲突一方被拒时**不得**改文件名绕过（制造分叉），等待或报告。
- **强制集成步**：并行后必须 `integrate_changes(project_id, ticket_ids)`，由集成负责人（人或 agent）执行：
  - [ ] 合并到集成基线　[ ] 冲突检测（以 `contracts` frozen 为单一真相源，谁偏离谁改）
  - [ ] 冒烟测试全绿（能启动 / 健康端点可达 / 跨模块主链路走通 / 共享类型编译过 / 契约一致性校验）
  - 冒烟未全绿 → `block_task`，不进 Phase 3。
- **契约变更升级**：并行中发现冻结契约需改 → 禁静默改。`freeze_contract` 升版时**自动 blocked 受影响在途任务**（provider+consumer 两侧），对齐新契约后 `unblock_task` 解阻塞。结构性变更仍走 `escalate_to='phase_1'`。

## 8. 成本与模型治理（§16.5）

- **模型路由**：`route_model(phase)`，grilling / adversarial / pre-mortem → `strong`；implement / tdd → `cheap`。避免全程最强模型烧钱。
- **成本台账**：每任务 `record_cost(project_id, tokens_in, tokens_out, cost_usd)`，超预算阈值（默认 $50）触发告警（不阻断，但明示）。`get_cost` 查询。

## 9. 分层 Prompt 注入策略（§10）

上下文窗口有限，不一次全塞。三层：

| 时机 | 注入内容 | 体量 | 工具 |
|---|---|---|---|
| **任务开始（轻）** | 该任务 language+framework 的 `quality_rules` core（≤15 条）+ 该模块 `contracts` 接口 + DoD | 小 | `get_conventions(task_id, scope='core')` |
| **编写中（按需）** | 完整 conventions（AI 问"XX 怎么命名/组织"才加载对应片段） | 中 | `get_conventions(..., 'full')` / 读 references 片段 |
| **验收时（全量）** | `anti-shortcut` 逐项 + `testing-requirements` 对照 + adversarial 5 角色 | 大 | `get_checklist(kind)` + `adversarial-review.md` |

`references/` 全程在线但**不在上下文**，规范随任务精准投送（§11）。

## 10. 三级 DoD（§16.2）

- **Task 级**：`dod` + `acceptance_criteria` + `test_spec`。`complete_task` 校验：依赖全 done + DoD 全满足 + 测试证据。
- **Phase 级**：每阶段退出标准（见 §3 各阶段「门控」）。
- **Release 级**：`human-approval-model.md` §4 的 8 项达标清单（all_tasks_done / blocked_zero / quality_gates / spec_conformance / nfr_met / tests_green / cost_within_budget / security_scan）。全绿 ≠ 自动发布，需 `release_signoff`。

## 11. 规范漂移与再校验（§16.11）

- `recheck_conformance(project_id)`：找出未绑定规范的已分配语言任务（潜在漂移）+ 仍标记为默认启发式的规范。
- 真正的代码级比对由 agent 执行。漂移二选一并**记录**：改代码符合约定，或显式 `set_convention` 覆盖（项目级）。不允许默默分叉。

## 12. 工具全集（52 个，全部由 MCP server 提供）

> 调用前必读对应工具的 `inputSchema`。以下为速查：必填参数省略说明即必填。

### 项目 / 阶段（project.js）
- `init_project(name, root_path, project_type?, maturity?)` — 建项目 + 初始化 6 阶段。root_path 唯一。
- `bootstrap_existing(name, root_path, project_type, maturity?, respect_or_refactor?, seed_conventions?)` — 已有代码库子模式。
- `rename_project(project_id, new_name?, new_root_path?)` — 改名/改 root_path。方案定稿后从临时名改为正式名。不改 WorkBuddy workspace 指针。
- `reset_project(project_id)` — **保留身份(name/root_path)，清空全部进度回 Phase 0**：删 work_items/tasks/契约/规范/决策/记忆/事件/锁/审批/成本，重建 6 阶段。走歪了想重来时用。⚠️ 破坏性，调用前 AskUserQuestion 确认。
- `delete_project(project_id)` — **彻底删除整个项目（含子表，靠 CASCADE）**，释放 root_path 后可重新 init。想连身份一起换时用。⚠️ 不可恢复，调用前必须 AskUserQuestion 确认。
- `get_state(project_id)` — 当前阶段 / 各阶段状态 / `identity_confirmed` / `pending_advance_to` / 进行中任务 / 阻塞项。**续跑前先调**。
- `list_projects(only_active?)` — **只读**列出 DB 中所有项目（id/name/root_path/project_type/maturity/current_phase/identity_confirmed/updated_at）。**多项目并行 + 新会话说"继续"时，先调它枚举，再 AskUserQuestion 让用户选要续哪个，然后 get_state(project_id)**。`only_active=true` 排除已到 phase_4 完成的项目。
- `advance_phase(project_id, target_phase, confirmed_by_user?, user_ack?)` — 推进阶段。**两步提交**：首次不带 `confirmed_by_user` 只停车不推进（返回停车指令）；用户确认后带 `confirmed_by_user=true`+`user_ack=<原话>` 才真正推进。前置 `gate_passed=1`；目标 phase_1 还要 `identity_confirmed=1`。三道门控 server 写死。
- `confirm_identity(project_id)` — 0.5.4 分支：name/root_path 不变时确认身份，置 `identity_confirmed=1`，解锁进 Phase 1。改名走 `rename_project`（也置位）。
- `pass_gate(project_id, phase_key, evidence)` — 标记门控通过（grilling 锁定）。需 evidence。**当 `phase_key='phase_0_5'` 且 `maturity` 为 commercial/enterprise 时，额外强制 NFR 全维度 `covered=1`，缺项直接 `fail`**（见下方 NFR 段）。

### 企业级 NFR 完整度（nfr.js）
- `get_nfr_checklist(project_id)` — 按 `maturity` 返回规划期必覆盖维度清单 + 当前 `covered` 状态 + 缺失项。每维度附对应 reference 指针。`enforced` 字段标明是否本档位强制。mvp 返回清单但 `enforced=false`。
- `set_nfr_coverage(project_id, dimension, covered?, notes?)` — 标记某 NFR 维度是否已在 PRD/技术方案中覆盖（upsert）。`dimension` 取枚举（见 `maturity-scoping.md` §NFR）。commercial/enterprise 必须全部 `covered=true` 才能 `pass_gate(phase_0_5)`。
- `set_stack(project_id, stack_json)` — 冻结技术栈。仅 phase_0 / phase_0_5 可写。

### 任务分解与 DAG（dag.js）
- `decompose(project_id, nodes[], parent_id?)` — 递归拆 DAG。成环直接拒。`nodes[].key/depends_on/type(enum)/language/module/dod/test_spec/acceptance_criteria/nfr/estimate`。
- `check_atomicity(task_id)` — 三条硬判据判原子性。
- `freeze_contract(project_id, provider_module, consumer_module, interface_spec, version?)` — 冻结模块间接口。**升版保护**：若同 (provider,consumer) 已存在 frozen 契约（即版本升级），自动把 provider+consumer 两侧仍 `in_progress`/`review` 的在途任务经 `blocks` 表标记 `blocked`（返回 `blocked_tasks`），防有人对着旧契约继续写。对齐后调 `unblock_task` 解阻塞。
- `get_contracts(project_id, module, role?)` — **只读**查询冻结契约（跨会话真相源）。任意 session 随时按 module 拉取其应遵守/应提供的全部 `frozen` 契约，**完全不打扰任务状态**。`role='consumer'` 查"我依赖谁提供的接口"，`role='provider'` 查"谁依赖我提供的接口"，省略返回两者。前端写代码过程中反复回看后端 API 定义就靠它（无需重调 `start_task`）。
- `get_dag(project_id)` — 完整任务图（节点 + 依赖边）。**每个节点附带其所属/遵守的 frozen 契约摘要**（id/provider_module/consumer_module/version），一次调用即可同时看到任务结构与契约上下文。

### 任务执行与门控（execution.js）
- `claim_task(task_id, session)` — 认领加锁。已被认领 → 拒。
- `check_dependencies(task_id, session?)` — 未满足前置 + 跨会话提醒文案。
- `start_task(task_id)` — 标 in_progress，返回规范 + 契约 + DoD。依赖全 done 才允许。
- `complete_task(task_id, evidence)` — 标 done。依赖全 done + evidence 才允许。
- `submit_review(task_id)` — 进 review 状态。
- `block_task(task_id, reason, blocked_by, workaround?)` — 记阻塞。blocked 对所有会话可见。
- `unblock_task(task_id, resolution)` — 解阻塞，回 in_progress。
- `get_next(project_id, session?, limit?)` — 推荐下一个可做原子任务。

### 增量需求（increment.js）
- `classify_change(project_id, description)` — full vs compressed 判定（保守默认 full）。
- `add_work_item(project_id, title, prd_fragment?, change_class?)` — 新建增量工作项。
- `merge_tickets(project_id, tasks[], work_item_id?)` — 并入 DAG，未完成依赖自动 blocked。

### 规范与知识（conventions.js）
- `get_conventions(task_id? | language, module?, scope='core'|'full', project_id?)` — 分层注入源。三种取径：① `task_id` ② `language`(+可选 `module`) ③ **仅 `module`**（自动从模块自身规范解析 language）。跨会话无需认领任务即可只读拉取某模块约定（回答"每个模块会话怎么从一开始就拿到本模块家规"）。DB 无则回退内置默认。
- `set_convention(project_id, language, framework?, module?, formatter?, linter?, quality_rules?, max_*?, is_default_heuristic?)` — 项目级覆盖（upsert）。
- `get_quality_rules(language, scope)` — 某语言质量规则子集（core/full）。
- `get_checklist(kind)` — testing/security/deploy/ops/review/bug 清单 + 对应 reference 文件。

### 记忆与决策（memory.js）
- `record_decision(project_id, context, decision, consequences?, task_id?, status?)` — ADR-lite，跨会话可见。
- `save_memory(project_id, category, key, value)` — lesson/preference/env/observation（upsert）。
- `search_memory(project_id, query, category?)` — 检索跨会话记忆。

### Bug 轨道（bug.js）
- `report_bug(project_id, symptom, severity?, source?, title?, module?, language?)` — 建 type=bug 节点。
- `abandon_work_item(task_id, reason, status?)` — 标 abandoned/superseded，清理依赖边。

### 审批 / 门控（approval.js）
- `request_approval(project_id, gate, target_id?)` — stack_approval/architecture_approval/release_signoff/ticket_review。写 pending。
- `record_approval(approval_id? | gate, target_id?, state, approver?, note?)` — approved/rejected。系统不得自动 approve。

### 并行 / 集成（parallel.js）
- `acquire_file_lock(project_id, file_path, session)` — 共享文件锁。被占 → 拒。
- `release_file_lock(file_path, session)` — 仅持有者可释放。
- `check_file_lock(file_path)` — 写前查锁。
- `integrate_changes(project_id, ticket_ids[])` — 标记 review，触发集成评审。

### 成本 / 模型（cost.js）
- `record_cost(project_id, task_id?, model?, tokens_in?, tokens_out?, cost_usd?, budget_usd?)` — 写台账，超预算告警。
- `get_cost(project_id)` — 累计 token/费用 vs 预算。
- `route_model(phase)` — 返回 strong/cheap 档位。

### 恢复 / 校验 / 升级（misc.js）
- `recheck_conformance(project_id)` — 规范漂移再校验。
- `detect_stale(project_id, threshold_days?)` — updated_at 超龄标 stale。
- `escalate_to_human(task_id, context_bundle)` — 诊断停滞 / 需人工决策时上交完整上下文。
- `add_progress_log(task_id, entry)` — 追加叙事进度（动作先写日志再动手）。
- `get_progress_log(task_id)` — 读叙事进度。

## 13. 跨 Workspace / 跨 Task 续跑

### 核心模型

> **root_path = 项目户籍地址（immutable until rename_project）**
> **WorkBuddy task 的 workspace = 当前窗口（可换、运行期不可改）**
> **lifecycle.db = 用户级全局状态（跨所有 workspace/task 共享）**

三样东西都是用户级的（`~/.workbuddy/...`），不随 workspace 变：
- 技能：`~/.workbuddy/skills/ai-coding-lifecycle`（软链）
- MCP server：`~/.workbuddy/mcp.json`（全局配置）
- 状态库：默认 `~/.workbuddy/ai-coding/lifecycle.db`

### SOP-A：不换 Task（最省事）

适用场景：项目目录不需要独立 git 视图 / 任务视图；或者只是想在一个对话里从方案做到交付。

```
1. 在任意 task 里聊方案
2. init_project(root_path="/d/work/java/AI-workspace/test")  ← 填目标目录（可不存在）
3. grilling 门控 → PRD/技术计划落 DB（record_decision / save_memory）
4. 直接在本 task 建骨架、拆 WBS、开发 —— 所有写文件用 root_path 绝对路径
5. 缺点：本 task 的 workspace 不是项目目录，相对路径会偏
```

### SOP-B：换 Task（test 想要独立 git/任务视图时用）

适用场景：项目需要有独立的 git 仓库、CI 配置、或你希望"这个窗口只看这一个项目"。

```
1. 在 skills/（或其他）task 里聊方案 + init_project(root_path="目标绝对路径")
   → 若名字未定，先用临时名 untitled-xxx 占位（见 §2「临时名占位」）
2. grilling 门控过 → 方案落 DB → 0.5.4：rename_project 改正式名 / confirm_identity 确认不变（置 identity_confirmed=1）
3. 本 task 里 mkdir 目标目录（WorkBuddy 选 workspace 通常要求目录已存在）
4. 你新开 task，workspace 选目标目录
5. 新 task 里：get_state(project_id) ← 读到同一个项目状态
   → ⚠️⚠️⚠️ 绝不能再调 init_project 同 root_path，否则报"项目已存在"
6. advance_phase(1) 触发停车 → 汇报 + AskUserQuestion 确认 → advance_phase(1, confirmed_by_user=true, user_ack) → 拆 WBS → 开发...
```

### 硬性纪律（违反会导致数据不一致）

| 规则 | 违反后果 |
|------|---------|
| **新 task 禁止二次 init_project 同 root_path** | 报错"项目已存在"，但更危险的是你可能绕开去建了两个"同名不同 id"的脏项目 |
| **换 task 前关键决策必须 record_decision / save_memory** | 只存在聊天记录里的洞见，换 task 后丢失 |
| **改名后需手动确保物理目录已创建** | DB 的 root_path 和物理世界不一致，后续 get_state 按 root_path 查不到 |
| **改名后如切换 workspace 需新开 task + get_state(id)** | 用 id 最稳；用新 root_path 也行，但别用旧的 |

### 并行多项目（一个 lifecycle.db 原生支持 N 个独立项目）

> **一个 workspace 窗口 ≠ 一个项目。项目身份 = root_path（或 project_id），不是你在哪个窗口。**
> 同一个窗口能先后操作多个项目（传不同 root_path）；同一个项目也能在不同窗口续跑（传同一 root_path）。

- `lifecycle.db` 里每行 project 有**自己独立的 6 阶段 + WBS + 决策/契约/记忆**，按 `project_id` 外键隔离，互不干扰。
- 系统靠你传的 `root_path` 决定"新建还是续跑"：`init_project` 命中唯一性校验 → 拒绝（报"已存在"）；`get_state(root_path=已存在)` → 读回老项目。
- **典型并行姿势**：上午在窗口 A 推 projA 的 Phase 3，下午在窗口 C 收 projC 的 Phase 4，DB 各记各的，永不串味。

### 重置 / 删除项目（走歪了想重来）

| 需求 | 工具 | 效果 |
|------|------|------|
| 全流程走歪，但保留项目身份(名字/目录不变) | `reset_project(project_id)` | 清空全部进度(任务/契约/决策/记忆…)回 Phase 0，身份保留。接着重新走 Phase 0→0.5→0.5.4(改名)→1 |
| 连身份一起不要，或想换 root_path | `delete_project(project_id)` | 整行删除(子表 CASCADE)，root_path 释放 → 可 `init_project` 同路径重建 |

> 两个都**破坏性**，调用前必须用 AskUserQuestion 向用户确认。reset 后若想顺手改正式名，可在新流程的 0.5.4 用 rename_project。

### 「继续」一词多义 → 歧义即问（友好优先）

用户只说"继续"且意图不明时，**直接 AskUserQuestion 让用户选**，不要猜、不要堆规则：

- 选项A：续项目生命周期（→ `list_projects` 枚举；多个项目则 AskUserQuestion 选哪个 → `get_state` 接 Phase/工作项）
- 选项B：续当前上下文（同 session 崩了/报错，直接接着干，不调 get_state）
- 选项C：续 bug 调试（已 `report_bug` 登记→`get_state` 找 bug 任务；未登记→靠上下文）

> 一句话：歧义就问，用户手动选最友好。多层歧义（生命周期 vs bug → 多个项目选哪个）一律 AskUserQuestion，不要瞎猜。

## 14. Reference 文件索引（42 个，按需注入，不进长上下文）

- **文章燃料（6）**：`prd-prompt.md` `tech-plan-prompt.md` `first-principles.md` `adversarial-review.md` `pre-mortem.md` `plan-doc-discipline.md`
- **文档抽取（8）**：`conventions-index.json`(机器消费) `code-quality-rules.md`(核心) `skeleton-template.md` `stack-decision.md` `testing-requirements.md` `deploy-checklist.md` `ops-checklist.md` `maturity-scoping.md`
- **缺口补齐（20）**：`env-config.md` `git-commit-convention.md` `pr-review-checklist.md` `db-migration-guide.md` `feature-flags.md` `logging-standards.md` `api-versioning.md` `performance-budget.md` `onboarding-template.md` `changelog-release.md` `backup-strategy.md` `security-baseline.md` `accessibility-i18n.md` `error-handling-patterns.md` `documentation-standards.md` `dependency-management.md` `observability-minimal.md` `data-modeling-guide.md` `ci-pipeline-template.md` `release-readiness.md`
- **补遗机制（8）**：`human-approval-model.md` `cost-model.md` `parallel-integration.md` `system-user-guide.md` `spec-conformance-check.md` `flaky-test-protocol.md` `test-fixtures-guide.md` `bug-handling-track.md`

## 15. 安全与密钥纪律（§16.7）

- **铁律**：AI 永不直接看到真实密钥，只看到占位符；密钥注入发生在部署/运行时，不进代码也不进 prompt（`env-config.md` + `security-baseline.md` 双重约束）。
- 供应链门控：CI 依赖扫描出 critical 漏洞 → 阻断发布（非仅告警）。
- PII 过滤：日志规范强制「什么不该记」，`logging-standards.md` 验收核对。

## 16. 调用本系统的硬规则（驾驶员 Checklist）

- [ ] 任何任务动作**先调 server**（state 在 DB），禁止绕开 server 直接改文件不更新状态（RK7）。
- [ ] `complete_task` 必须带 evidence（测试通过 / 覆盖率达标 / lint 通过），否则 server 拒。
- [ ] 阶段推进前确认前置 `gate_passed=1`；grilling 未锁定绝不下 Phase 1。
- [ ] **每个阶段完成后必须停车**：`advance_phase` 首次只停车，向用户汇报 + `AskUserQuestion` 确认后才带 `confirmed_by_user=true` 推进。**绝不在同一轮自己 confirm 冲进下一阶段**。
- [ ] 进 Phase 1 前 `identity_confirmed=1`（0.5.4 已 `rename_project` / `confirm_identity`），否则 server 拒。
- [ ] 新需求先 `classify_change`，compressed 绝不复位阶段。
- [ ] Bug 走 §6 兄弟轨道，绝不 `abandon` 主流程阶段。
- [ ] 写码前 `get_conventions(..., 'core')` 注入；验收时 `get_checklist` + `anti-shortcut` 全量核对。
- [ ] 多会话抢同一任务 → `claim_task` 被拒时停下，不强行改。
- [ ] 发布前 `release_signoff` 必须由人类显式 `record_approval(approved)`，系统不自动放行。
