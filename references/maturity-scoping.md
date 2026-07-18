# 成熟度范围裁剪（Maturity Scoping）

> 来源：`project-architecture.zh.md` 第 6 层（L6）成熟度对比 + `ai-coding-lifecycle-plan.md` §8.2 / §8.3 / §16.3。
> 用途：决定每个项目启用哪些 reference 内容；MVP 可延后某些项，但文件仍存在、内容已写。

"正确"的架构是阶段的函数。MVP 做全套企业级会扼杀速度；企业规模做 MVP 级会导致中断与审计失败（L6）。

---

## 1. 三层成熟度对比（L6）

| 维度 | MVP / 原型 | 商业 / 成长期 | 企业级 |
|---|---|---|---|
| **仓库** | 单一仓库（可能 monorepo） | monorepo 或少量服务 | monorepo + 按领域 polyrepo，严格所有权 |
| **分支** | GitHub Flow / 主干，简单 | 主干 + PR 评审 | 主干 + 强制评审 + 发布列车 |
| **语言** | 一个技术栈（如 TS 全栈） | 1–2 栈，按服务合适 | 多个，受标准治理 |
| **数据存储** | 一个 DB（Postgres）+ 可能 Redis | Postgres + 缓存 + MQ + 搜索 | 多语言持久化、分片、复制 |
| **测试** | 单元 + 少量 E2E | 金字塔 + 集成 + 性能 | 完整金字塔 + 契约 + 混沌 + 合规 |
| **部署** | PaaS（Vercel/Render）或单服务器 | 容器 + CI/CD，可能 K8s | K8s/IaC + 渐进式交付 + 多区域 |
| **可观测性** | 基础日志 + Sentry | Prometheus/Grafana + APM + SLO | 完整 OTel + APM + SLO + on-call + runbook |
| **安全** | 依赖扫描 + 密钥管理 | + SAST/DAST + WAF + 访问控制 | + SOC2/GDPR + 漏洞管理 + 审计 + IR 计划 |
| **灾备** | 备份，单可用区 | 备份 + 多可用区，已测试 | 多区域，正式 RTO/RPO，演练日 |
| **团队** | 1–5 通才 | 5–30，部分专精 | 30+，平台/SRE/安全团队 |

## 2. start small, grow later 路径

在*痛点*而非日历上触发升级（L6）：

- PaaS 受限 或 >~10 个可部署服务 → 采用 **K8s**
- on-call 被动响应 → 采用正式 **SLO**
- 企业销售需要 → 采用 **SOC 2**
- 真实流量预测出现 → 加 CI/CD + 集成测试
- 合同约束可用性 → 正式 RTO/RPO + 多区域

## 3. 各 reference 启用矩阵

本项目自身 8 个文档抽取文件**全部强制**；下方针对 §8.3 缺口补充文件的"启用 vs 延后"。**文件都存在、内容都写**，仅决定该项目是否启用。

| Reference 文件 | MVP | Commercial | Enterprise | 备注 |
|---|:---:|:---:|:---:|---|
| `code-quality-rules.md` | **强制** | **强制** | **强制** | 核心，不分成熟度 |
| `code-quality-rules` 全套语言 | 用到的语言 | 用到的语言 | 全部 | 按实际栈裁剪 |
| `skeleton-template.md` | **强制** | **强制** | **强制** | 骨架必建 |
| `stack-decision.md` | 强制 | 强制 | 强制 | 决策参照 |
| `testing-requirements.md` | 强制（单元+少量E2E） | 强制（全金字塔） | 强制（+混沌/合规） | 范围随层扩大 |
| `deploy-checklist.md` | 强制（PaaS 子集） | 强制（容器+CI/CD） | 强制（K8s+IaC） | 范围随层扩大 |
| `ops-checklist.md` | 部分（日志+Sentry+备份） | 大部分 | 全量 | 见下方延后项 |
| `maturity-scoping.md` | 强制（本文件） | 强制 | 强制 | 裁剪依据 |
| `env-config.md` | 强制 | 强制 | 强制 | 密钥铁律 |
| `git-commit-convention.md` | 强制 | 强制 | 强制 | 廉价纪律 |
| `security-baseline.md` | 强制（依赖扫描+密钥） | 强制（+SAST/DAST/WAF） | 强制（+SOC2/GDPR） | 范围随层 |
| `backup-strategy.md` | **强制**（MVP 也要） | 强制（多AZ+演练） | 强制（DR） | L6 明确 MVP 也要 |
| `observability-minimal.md` | **强制**（Sentry+基础日志） | 强制 | 强制 | 不能两眼一抹黑 |
| `db-migration-guide.md` | 强制 | 强制 | 强制 | 有 DB 即需迁移 |
| `logging-standards.md` | 强制 | 强制 | 强制 | 防密钥打进日志 |
| `onboarding-template.md` | 推荐 | 强制 | 强制 | 换会话/新人跑起来 |
| `ci-pipeline-template.md` | 推荐（可手动） | **强制** | **强制** | 频繁部署必需 |
| `feature-flags.md` | 延后 | 强制（金丝雀/AB） | 强制 | MVP 可用简单配置开关 |
| `pr-review-checklist.md` | 推荐 | 强制 | 强制 | 团队化后必需 |
| `api-versioning.md` | 延后 | 推荐 | 强制 | 第三方 API 才需 |
| `performance-budget.md` | 延后 | 推荐 | 强制 | NFR 一等公民 |
| `changelog-release.md` | 推荐 | 强制 | 强制 | 发版记录 |
| `accessibility-i18n.md` | 延后 | 推荐 | 强制 | UI 任务必过 checklist |
| `error-handling-patterns.md` | 强制 | 强制 | 强制 | 与质量规则互补 |
| `documentation-standards.md` | 推荐 | 强制 | 强制 | |
| `dependency-management.md` | 强制（锁文件） | 强制 | 强制（供应链安全） | |
| `data-modeling-guide.md` | 推荐 | 推荐 | 强制 | |
| `human-approval-model.md` | 默认档 | 默认/严格 | 严格档 | 谁决定可发布（§16.3） |
| `cost-model.md` | 推荐 | 推荐 | 强制 | 预算管控 |
| `parallel-integration.md` | 延后 | 推荐 | 强制 | 并行机械细节 |
| `spec-conformance-check.md` | 推荐 | 强制 | 强制 | 防过度/不足工程 |
| `flaky-test-protocol.md` | 推荐 | 强制 | 强制 | |
| `test-fixtures-guide.md` | 推荐 | 强制 | 强制 | |
| `bug-handling-track.md` | 强制 | 强制 | 强制 | 顽固 bug 轨道 |
| `system-user-guide.md` | 强制 | 强制 | 强制 | 人怎么驾驶 |
| `conventions-index.json` | 强制 | 强制 | 强制 | 机器消费入口 |

**延后 ≠ 删除**：标记为"延后"的项，文件已建、内容已写；当项目成熟度升级或痛点触发时启用，无需补写。

## 5. Phase 0 规划期 NFR 必覆盖维度（按档位）

> 本表是 `get_nfr_checklist` / `pass_gate(phase_0_5)` 的**强制依据**。规划阶段（Phase 0）PRD/技术方案必须逐条落实，再 `set_nfr_coverage` 标记。
> **mvp**：仅建议展示，`pass_gate` 不强制。 **commercial / enterprise**：缺任意一项 `pass_gate(phase_0_5)` 直接 `fail`。

| # | 维度 key | 含义 | 对应 reference | mvp | commercial | enterprise |
|---|---|---|---|:---:|:---:|:---:|
| — | backup | 备份策略 | `backup-strategy.md` | 建议 | ✅ | ✅ |
| — | logging | 日志规范（密钥不打日志） | `logging-standards.md` | 建议 | ✅ | ✅ |
| — | secrets | 密钥管理（env-config 铁律） | `env-config.md` | 建议 | ✅ | ✅ |
| — | error_handling | 错误处理模式 | `error-handling-patterns.md` | 建议 | ✅ | ✅ |
| 1 | security_scan | 安全扫描 SAST/DAST/WAF | `security-baseline.md` | — | ✅ | ✅ |
| 2 | cicd | CI/CD 流水线 | `ci-pipeline-template.md` | — | ✅ | ✅ |
| 3 | feature_flags | 功能开关 / 金丝雀 | `feature-flags.md` | — | ✅ | ✅ |
| 4 | testing_pyramid | 测试金字塔（集成/E2E） | `testing-requirements.md` | — | ✅ | ✅ |
| 5 | observability_basic | 可观测性 Prometheus/APM | `observability-minimal.md` | — | ✅ | ✅ |
| 6 | compliance | 合规范围（SOC2/GDPR） | `security-baseline.md` | — | — | ✅ |
| 7 | data_residency | 数据驻留 | `data-modeling-guide.md` | — | — | ✅ |
| 8 | multi_region_dr | 多区域灾备（RTO/RPO/演练） | `backup-strategy.md` | — | — | ✅ |
| 9 | audit_trail | 审计追踪 | `security-baseline.md` | — | — | ✅ |
| 10 | incident_response | 事件响应计划（IR） | `security-baseline.md` | — | — | ✅ |
| 11 | cost_ceiling | 成本上限 | `cost-model.md` | — | — | ✅ |
| 12 | sla_slo | SLO / on-call / runbook | `observability-minimal.md` | — | — | ✅ |
| 13 | multi_tenancy | 多租户隔离 | `data-modeling-guide.md` | — | — | ✅ |
| 14 | accessibility | 可访问性（WCAG） | `accessibility-i18n.md` | — | — | ✅ |
| 15 | perf_budget | 性能预算 | `performance-budget.md` | — | — | ✅ |
| 16 | strict_approval | 严格发布门禁 | `human-approval-model.md` | — | — | ✅ |

`commercial` 强制 = 维度 1–5 + 4 条 base；`enterprise` 强制 = 全部 16 项。

## 4. 审批档位（§16.3）

- **默认档**：MVP/Commercial 用默认审批（grilling 门控 + release_signoff），常规内部 PR 不强求人工 review。
- **严格档**：Enterprise 用严格审批（stack_approval + architecture_approval + 每票 ticket_review + release_signoff）。
- 由 `maturity-scoping.md` 按 `projects.maturity` 选定；**谁决定可发布默认是用户**，系统只给"是否达标"的客观清单。
