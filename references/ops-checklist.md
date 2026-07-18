# 运维清单（Ops Checklist）

> 来源：`project-architecture.zh.md` 第 5 层（L5）维护与运维 + `ai-coding-lifecycle-plan.md` §8.2。
> 用途：Phase 4 交付前的运维就绪核对；上线后实际运维基线。

构建只是工作的一半；可靠地运维是另一半，把 demo 与产品区分开（L5）。

---

## 1. 可观测性：日志、指标、追踪（L5.1）

三大支柱：日志（事件）、指标（时序数值）、追踪（跨服务请求旅程）。

- [ ] **OpenTelemetry** 生成厂商中立的日志/指标/追踪，早采用避免锁定
- [ ] 指标：**Prometheus** + **Grafana** 仪表盘
- [ ] 日志：**Loki** / ELK / OpenSearch
- [ ] 追踪：**Jaeger** / **Tempo**
- [ ] 结构化日志；敏感数据过滤（参考 `logging-standards.md` 缺口补充）

## 2. 监控、告警与 SLO（L5.2）

框架来自 Google SRE 书（sre.google）；告警哲学：症状而非原因，避免告警疲劳。

- [ ] 每个关键服务定义 **3–5 个 SLO**（如 99.9% 可用性、p99 延迟）
- [ ] SLI 度量 + **错误预算（error-budget）** 驱动发布决策
- [ ] 告警接 **on-call 轮值**（Alertmanager / Grafana Alerting / PagerDuty / Opsgenie）
- [ ] 告警在产生生产流量的第一天接入

## 3. APM 与错误追踪（L5.3）

- [ ] **Sentry**（开源核心，快速低成本起点）
- [ ] 规模化 → **Datadog** / **New Relic** 统一平台
- [ ] 集中错误/崩溃报告：堆栈跟踪 + 用户影响分组
- [ ] 性能剖析（Pyroscope / OTel tracing）

## 4. DevOps / DORA 指标（L5.4）

一手来源 dora.dev / *Accelerate*。北极星健康指标：

- [ ] 部署频率、变更前置时间、变更失败率、服务恢复时间（+ 可靠性/运维性能）
- [ ] 卓越效能者：按需部署、一小时内恢复、低变更失败率
- [ ] 从一开始就跟踪，校验其他每层决策

## 5. 安全维护（L5.5）

- [ ] CI 持续**依赖/漏洞扫描**：Snyk / Dependabot / CodeQL（SAST 概念 OWASP）
- [ ] **密钥轮换**：Vault（见 L1.7）
- [ ] **WAF**：Cloudflare / AWS WAF（边缘过滤恶意流量）
- [ ] 合规：SOC 2（AICPA）、GDPR（欧盟个人数据）—— 处理客户数据/卖企业时相关，尽早规划（数据映射、访问控制）
- [ ] 供应链门控：CI 出 critical 漏洞阻断发布（plan §16.7）

## 6. 备份、灾备与伸缩（L5.6）

- [ ] 备份：DB 原生（pg_dump/WAL、RDS 快照）、S3 对象版本控制
- [ ] **测试恢复**——未测试的备份不算数（见 `backup-strategy.md` 缺口补充）
- [ ] 多可用区（始终）+ 多区域（高风险时）
- [ ] 定义 **RTO/RPO** 目标（sre.google 可用性表）
- [ ] 伸缩：优先**水平**（负载均衡后加副本）> 垂直；K8s HPA / 云 ASG 自动伸缩；缓存卸载 DB；CDN 用于静态资源

## 7. 事件响应（L5.7）

参考 Google SRE 事件管理 + 无指责复盘文化。

- [ ] 定义 **on-call 轮值**、严重等级分类
- [ ] **Runbook**：已知问题的成文步骤
- [ ] **无指责 postmortem** 模板（事件后学习）
- [ ] **状态页**：公开事件沟通（Statuspage / cstate）
- [ ] 在第一次重大事件*之前*定义，而非之中

---

## 8. 运维就绪清单（Gate，Phase 4 核对）

- [ ] 可观测性三支柱已接入（OTel + Prometheus/Grafana + Loki）✓
- [ ] Sentry / APM 接入，错误可追踪 ✓
- [ ] ≥3 SLO 定义，告警接 on-call ✓
- [ ] DORA 指标开始跟踪 ✓
- [ ] CI 持续安全扫描（SAST+依赖+密钥），WAF 已启用 ✓
- [ ] 备份已配置**且恢复已演练**；多可用区 ✓
- [ ] 伸缩策略（HPA/ASG）+ CDN 已就绪 ✓
- [ ] on-call 轮值 + runbook + postmortem 模板 + 状态页就位 ✓
- [ ] 合规（SOC2/GDPR）如适用已规划 ✓

> 范围裁剪见 `maturity-scoping.md`：MVP 可只做基础日志+Sentry，但备份+多可用区从第 1 天起（L6）。
