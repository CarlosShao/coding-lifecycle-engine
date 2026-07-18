# Spec Conformance Check

> 机制文件 · 验证交付行为是否匹配 ticket（PRD 片段 / task 描述）。专抓**过度工程、不足工程、做偏（drift）**。与 adversarial review（安全/健壮向）互补，不替代。

## 1. 为什么需要

adversarial review 回答"代码够不够硬/安不安全"。它不回答"你做的**是不是用户要的那件事**"。

常见问题本检查抓：
- **过度工程**：ticket 要个 CRUD，给了插件系统 + 事件总线 + 配置 DSL。
- **不足工程**：ticket 要批量导入，只做了单条，边界/错误/大文件全没管。
- **做偏（drift）**：ticket 要 A，实现成了 B 的近似，验收时没人对照原始需求。

## 2. 输入与对照源

- 主对照：`tasks.acceptance_criteria`（继承 PRD 并可细化）+ task 标题/描述。
- 次对照：原始 `work_items.prd_fragment`、相关 `contracts` 接口范围。
- 判据粒度：以 task 级 DoD 为准（§9.7），但**行为符合性**额外看 acceptance_criteria 的每一条。

## 3. 检查清单（逐条核对）

对 ticket 的每条 acceptance_criteria：

- [ ] **存在**：该行为是否真的被实现（不是占位/stub/mock 冒充）？
- [ ] **正确**：实现语义与描述一致（无做偏）？
- [ ] **边界**：描述隐含的边界（空/超长/并发/异常输入）是否被覆盖？
- [ ] **无多余**：是否引入了 ticket 未要求的能力/抽象/配置？（标 `over_engineering`）
- [ ] **无缺失**：ticket 隐含的必要步骤是否遗漏？（标 `under_engineering`）
- [ ] **契约一致**：实现范围与冻结 `contracts` 接口一致，未私自扩接口？

## 4. 判定与处置

| 结果 | 标记 | 动作 |
|---|---|---|
| 全部符合，无多余无缺失 | `conformant` | 通过，进下一门 |
| 过度工程 | `over_engineering` | 记录在 `progress_log`/review；建议剥离多余抽象；不阻塞但记入 anti-shortcut 核对 |
| 不足工程 | `under_engineering` | 退回 `in_progress`，补全缺失项，带测试 |
| 做偏 drift | `drift` | 与用户确认：是需求理解错（升级 `escalate_to='phase_1'`）还是实现错（返工） |

## 5. 与 adversarial review 的关系（重要）

- 本检查 **complement，不 replace** adversarial review。
- 顺序建议：先 `spec_conformance_check`（对不对题）→ 再 adversarial（够不够硬）。两者都过才进 Phase 4。
- 一个常见陷阱：adversarial 过了但做的是错的事（drift），因为对抗审查默认假设"需求正确"。本检查补这块。
- 在 `anti-shortcut-workflow` 中，本检查清单作为独立一组存在，不与安全/健壮组混。

## 6. 工具与记录

- `recheck_conformance(project_id)` 也可在 Phase 边界调用，比对 DB 约定 vs 实际代码（规范漂移），与本检查（行为 vs ticket）是两个维度，勿混淆。
- 本检查结论写入 `events`（tool=`spec_conformance`，payload=逐条结果），供后续会话审计。
