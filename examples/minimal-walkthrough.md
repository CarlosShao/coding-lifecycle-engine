# Minimal Walkthrough — 端到端走一遍 P0 → P4

> 目的：用一个**真实的小需求**，演示本系统从「一句话想法」到「可交付产品」的完整闭环，以及中途续跑、压缩新增、Bug 兄弟轨道三个分支。
> 所有工具调用均为示意（参数名见 `SKILL.md` §12）。真实调用由 MCP server 执行，状态落 `lifecycle.db`。
> 示例项目：**`mdsearch`** —— 一个本地 Markdown 笔记全文搜索 CLI（TypeScript + Node，单语言，足以跑通全阶段又不膨胀）。

---

## 0. 一句话启动

用户：「用 ai-coding-lifecycle 做一个本地 Markdown 全文搜索 CLI」

```
route_model(phase='phase_0')                      # cheap（PRD/方案阶段可 cheap）
init_project(
  name='mdsearch',
  root_path='/d/work/mdsearch',
  project_type='greenfield',
  maturity='mvp'
)
# → { project_id: 'p_abc', current_phase: 'phase_0' }
```

回显：「当前 Phase 0（需求与初始方案），下一步：调 to-spec 生成 PRD。说'继续'即可。」

---

## Phase 0 — 需求与初始方案

```
# 引擎：to-spec；注入燃料：prd-prompt.md + first-principles.md
# 产出 PRD（背景/用户/问题/功能范围/边界/非功能/验收）
# 引擎：codebase-design；注入：tech-plan-prompt.md + stack-decision.md + skeleton-template.md
# 产出技术方案 + 栈选型草案
set_stack(project_id='p_abc', stack_json='{"language":"typescript","runtime":"node22","cli":"commander","search":"minisearch","test":"vitest"}')
# 每完成一小项写外部记忆：
add_progress_log(task_id=<prd_task>, entry='PRD v1 完成，含 5 个核心场景')
```

产物：PRD + 技术方案 + 栈选型草案。**门控：无**，直接进入 0.5。

---

## Phase 0.5 — Grilling 打磨 ★硬门控★

```
# 引擎：grilling（多轮压力测试）
# 例：用户质疑「中文分词怎么处理」「大仓库性能」「是否要索引持久化」
# 轮次软上限（如 6 轮）防卡死；超了提示「接受当前 or 明确保留项」
# 用户明确锁定：
pass_gate(project_id='p_abc', phase_key='phase_0_5', evidence='用户确认方案锁定：单文件全量扫描+minisearch 内存索引，MVP 不做持久化索引')
# → gate_passed=1
# advance_phase 现在才被允许：
advance_phase(project_id='p_abc', target_phase='phase_1')
# → current_phase='phase_1'
```

**纪律校验**：若在 `pass_gate` 前直接 `advance_phase(target_phase='phase_1')` → server 拒绝（`phase_0_5 gate_passed=0`）。

---

## Phase 1 — 拆分与契约冻结

```
# 引擎：to-tickets 出粗票 → decompose 递归拆到原子；check_atomicity 把关
decompose(project_id='p_abc', nodes=[
  { key:'cli',   title:'CLI 入口与参数解析', type:'module', language:'typescript', module:'cli',
    dod:'commander 解析 query/path 参数；--help 可用' },
  { key:'scan',  title:'Markdown 文件扫描器', type:'module', language:'typescript', module:'scan',
    dod:'递归扫描目录收集 .md 文件清单' },
  { key:'parse', title:'Markdown 正文提取', type:'module', language:'typescript', module:'parse',
    dod:'剥离 frontmatter/代码块，输出纯文本' },
  { key:'index', title:'全文索引构建', type:'module', language:'typescript', module:'index',
    depends_on:['scan','parse'], dod:'用 minisearch 建内存索引' },
  { key:'search',title:'查询执行', type:'module', language:'typescript', module:'search',
    depends_on:['index'], dod:'返回命中文件+片段+评分' },
  { key:'out',   title:'结果渲染', type:'atomic_task', language:'typescript', module:'cli',
    depends_on:['search'], dod:'终端高亮输出命中' },
])
# 循环依赖会被拒（如 search 反向依赖 scan）→ 报 ERROR 不成环

# 冻结模块间接口（并行前必须先冻结）
freeze_contract(project_id='p_abc', provider_module='scan',  consumer_module='index',
  interface_spec='scanFiles(root:string): Promise<string[]>')
freeze_contract(project_id='p_abc', provider_module='parse', consumer_module='index',
  interface_spec='extractText(path:string): Promise<string>')
freeze_contract(project_id='p_abc', provider_module='index', consumer_module='search',
  interface_spec='buildIndex(docs:{path,text}[]): MiniSearch')
freeze_contract(project_id='p_abc', provider_module='search',consumer_module='cli',
  interface_spec='runQuery(q:string): Hit[]')

# 每模块绑定语言+质量规则（从 conventions-index.json 取默认）
set_convention(project_id='p_abc', language='typescript', module='cli',   coverage_threshold=80)
set_convention(project_id='p_abc', language='typescript', module='scan',  coverage_threshold=80)
set_convention(project_id='p_abc', language='typescript', module='parse', coverage_threshold=80)
set_convention(project_id='p_abc', language='typescript', module='index', coverage_threshold=85)
set_convention(project_id='p_abc', language='typescript', module='search',coverage_threshold=85)
```

产物：完整 DAG（scan→index, parse→index, index→search, search→cli）+ 4 条冻结契约 + 每模块规范。
门控：契约全部 `frozen` 才进 Phase 2。

```
advance_phase(project_id='p_abc', target_phase='phase_2')   # → current_phase='phase_2'
```

---

## Phase 2 — 并行开发

假设两个会话并发（Session A 做 scan/parse，Session B 做 index/search；cli 模块留到收尾）。

**Session A：**
```
get_next(project_id='p_abc', session='A')          # 推荐 scan / parse（依赖已满足、未认领）
claim_task(task_id='scan', session='A')            # 加锁，owner=A
check_dependencies(task_id='scan')                 # unmet=[] → 可开工
start_task(task_id='scan')                          # 返回规范+契约+DoD
# 写码前注入（分层·轻）：
get_conventions(task_id='scan', scope='core')      # ≤15 条 TS 核心质量规则 + scan 契约 + DoD
# 引擎：implement + tdd（写 scanner.ts + scanner.test.ts）
complete_task(task_id='scan', evidence='vitest 全绿，覆盖率 92%，lint 通过，DoD 全满足')
# 同理完成 parse
```

**Session B（并行，不相交模块）：**
```
claim_task(task_id='index', session='B')
check_dependencies(task_id='index')                # 依赖 scan/parse 属 Session A → 跨会话提醒
# 提醒：若 scan/parse 未完成，B 须等 A 完成（依赖门控）。这里假设 A 已先完成。
start_task(task_id='index')
get_conventions(task_id='index', scope='core')
# implement + tdd：index.ts 依赖冻结契约 scanFiles/extractText
complete_task(task_id='index', evidence='...')
# 同理完成 search
```

**共享文件（cli 入口）写前锁：**
```
acquire_file_lock(project_id='p_abc', file_path='/d/work/mdsearch/src/cli/index.ts', session='A')
# 写 cli 入口，调用冻结契约 runQuery
release_file_lock(file_path='/d/work/mdsearch/src/cli/index.ts', session='A')
```

**强制集成步：**
```
integrate_changes(project_id='p_abc', ticket_ids=['scan','parse','index','search','cli','out'])
# 集成负责人跑冲突检测（以 contracts frozen 为准）+ 冒烟：
#   - 应用能启动（node dist/cli.js --help）
#   - 健康：对样例仓库跑一次查询返回命中
#   - 共享类型编译过
# 冒烟全绿 → 进 Phase 3；否则 block_task
```

门控：全票 done 才进 Phase 3。

```
advance_phase(project_id='p_abc', target_phase='phase_3')   # → current_phase='phase_3'
```

---

## Phase 3 — 对抗验收 ★不糊弄★

```
# 引擎：code-review 切 adversarial；注入 adversarial-review.md（5 角色）
# 引擎：anti-shortcut-workflow（逐条核对，禁用「基本完成」话术）
get_checklist(kind='testing')     # 单测/集成/覆盖率
get_checklist(kind='security')    # 输入边界、路径遍历防护（query 含 ../ 不能越权读）
get_checklist(kind='review')      # 单一职责/命名/错误处理
recheck_conformance(project_id='p_abc')   # 规范漂移：未绑定规范的已分配任务
# 发现 bug → 走 §6 兄弟轨道（report_bug），不阻塞主流程阶段推进逻辑
```

门控：所有 checklist 项**有工具证据**通过才进 Phase 4。

```
advance_phase(project_id='p_abc', target_phase='phase_4')   # → current_phase='phase_4'
```

---

## Phase 4 — 失败预演与交付

```
# 引擎：pre-mortem.md 引导（三个月后失效原因，按概率排序）
#   例：大仓库内存爆、中文分词差、无持久化索引导致每次慢
# 核对 deploy/ops checklist：
get_checklist(kind='deploy')   # 构建/CI/回滚预案
get_checklist(kind='ops')      # 日志/告警/备份
# 汇总发布达标清单（human-approval-model.md §4 的 8 项）：
get_state(project_id='p_abc')   # all_tasks_done / blocked_zero
get_cost(project_id='p_abc')    # cost_within_budget
recheck_conformance(project_id='p_abc')  # spec_conformance
# 交还用户：以上 8 项全绿，是否 sign-off？
request_approval(project_id='p_abc', gate='release_signoff')
# 用户显式：
record_approval(gate='release_signoff', state='approved', approver='user')
# 引擎：handoff（交付文档 + CHANGELOG + README 跑通说明）
```

**release_signoff 永不免除**（即使压缩热修）。未 approved，`handoff` 应被拒。

---

## 分支 A — Resume（中途「继续」）

用户第二天打开新会话说「继续」。

```
get_state(project_id='p_abc')
# → current_phase='phase_2', 进行中: [scan(A)], blocks: []
detect_stale(project_id='p_abc', threshold_days=7)   # 若 updated_at 超 7 天 → 提示确认
# 回显：「当前 Phase 2，scan 由 Session A 进行中，下一步：完成 scan 后 claim parse。说'继续'即可。」
```

状态全在 `lifecycle.db`，新会话与老会话断点续跑**行为一致**。

---

## 分支 B — 压缩生命周期（中途加一个功能）

用户：「给 mdsearch 加一个 `--export json` 把结果导出」。

```
classify_change(project_id='p_abc', description='给已有 query 结果加 --export json 输出')
# → path='compressed'（轻度：加字段/小增强）
add_work_item(project_id='p_abc', title='export json', prd_fragment='查询结果支持 --export json', change_class='compressed')
merge_tickets(project_id='p_abc', tasks=[
  { key:'exp', title:'JSON 导出器', type:'atomic_task', language:'typescript', module:'cli',
    depends_on:['search'], dod:'--export json 输出 Hit[] 的 JSON' }
])
# 新票 depends_on=['search']（已完成）→ 不自动 blocked；若依赖未完成则自动 blocked
# 只重跑受影响部分（cli 模块 + 受影响 P2/P3），不重置 phase_2，不重走 P0→P4
```

隔离保证：DAG 增量融入，已完成票不受影响（§5.3）。

---

## 分支 C — Bug 兄弟轨道（测试发现 bug）

Phase 2 测试红：`runQuery` 对含空格的路径报错。

```
report_bug(project_id='p_abc', symptom='路径含空格时 minisearch 报 ENOENT', severity='high', source='test_failure', module='search')
# → 建 type='bug' 节点，hypothesis='[]'，不重置 phase_2
# 1) reproduce：稳定复现（写失败测试）
# 2) 引擎 diagnosing-bugs 循环：假设→验证→修复→复验（每轮假设写入 hypothesis[]）
# 3) 修复带回归测试（测试失败于修复前、绿于修复后）
# 4) anti-shortcut 核对：「真修根因？还是压症状？」（catch 吞错 → fail 退回）
# 5) complete_task(task_id=<bug>, evidence='回归测试绿，根因为路径未引号转义，已修')
# 若 root_cause = 契约错误 → escalate_to='phase_1' 走升级（§6），非静默改
# 若假设耗尽仍无根因 → escalate_to_human(task_id, context_bundle) 上交人类
```

Bug 闭环**不动主流程阶段**（违反 §0.3 纪律3）。

---

## 收尾检查清单

- [x] 6 阶段全跑通，每阶段 `gate_passed` 正确
- [x] grilling 未锁定绝不下 Phase 1（server 拒绝验证过）
- [x] 依赖未完成时 `complete_task` 被拒（server 拒绝验证过）
- [x] 循环依赖 `decompose` 成环被拒（server 拒绝验证过）
- [x] 压缩新增未重置阶段，融入 DAG
- [x] Bug 兄弟轨道不重置阶段
- [x] `release_signoff` 由人类显式 `record_approval` 放行
- [x] 所有 reference 按需注入，未进长上下文（分层 §9）
