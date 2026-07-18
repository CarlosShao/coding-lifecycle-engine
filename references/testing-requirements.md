# 测试要求（Testing Requirements）

> 来源：`project-architecture.zh.md` 第 3 层（L3）测试 + `ai-coding-lifecycle-plan.md` §8.2。
> 用途：Phase 2 开发 DoD 测试要求 + Phase 3 验收对照（配合 `code-quality-rules.md`）。

测试是让所有后续层都能安全变更的反馈环。**套件的形状比规模更重要**——倒置金字塔（过多 E2E）会扼杀部署频率。

---

## 1. 测试金字塔（L3.1）

底部大量快速单元 → 中部较少集成 → 顶部少量缓慢 E2E（Mike Cohn；现代解释见 Martin Fowler）。部分团队用"测试奖杯"（更多集成，Kent C. Dodds）。

```
        /\          E2E (少数, 慢)
       /  \         ── Playwright / Cypress
      /----\        集成 (较少, 中)
     /      \        ── 真实/容器化依赖 (Testcontainers)
    /--------\      单元 (大量, 快)
   /          \      ── pytest / Jest / Vitest / go test / cargo test
```

## 2. 按语言的测试框架（L3.2）

| 语言 | 框架（一手来源） |
|---|---|
| JS/TS | Jest（jestjs.io）、Vitest（vitest.dev，Vite 原生快） |
| Python | pytest（docs.pytest.org）、标准库 unittest |
| Java/Kotlin | JUnit（junit.org）、Kotest |
| .NET | xUnit、NUnit |
| Go | 内置 `testing` 包 |
| Rust | 内置 `cargo test` |

**测试数据/fixture**：统一工厂/fixture 管理，测试环境与生产环境一致性（见 `test-fixtures-guide.md` 缺口补充）。

## 3. TDD（L3.3）

红-绿-重构循环（Kent Beck）。**何时采用**：对业务关键逻辑和库使用 TDD；UI/胶水代码优先用更轻量的集成测试。Phase 2 开发默认 `tdd` 引擎驱动核心逻辑。

## 4. 契约 / 集成测试（L3.4）

- **消费者驱动契约 Pact**（docs.pact.io）：消费者定义预期互动，提供方验证。
- **Spring Cloud Contract**（JVM 中心）。
- 普通集成测试直连真实/容器化依赖（Testcontainers）。
- **何时采用**：任何具有独立部署节奏的多服务系统 → 在边界上做契约测试。与 `conventions.contracts`（冻结接口）对应。

## 5. 性能 / 负载测试（L3.5）

- **k6**（JS 脚本化、开发者友好）、**Artillery**、**Gatling**、**JMeter**。
- **何时采用**：发布前 + 对任何有真实流量预测、面向用户的端点定期进行。NFR（延迟/吞吐/内存）见 task `nfr` 字段，由 `performance-budget.md` 在验收核对。

## 6. 安全测试（L3.6）

- **SAST**：扫描源码（OWASP；Snyk/CodeQL）。
- **DAST**：测试运行中的应用（OWASP WSTG）。
- **依赖扫描**：Snyk、Dependabot、npm audit。
- **密钥扫描**：gitleaks、TruffleHog。
- **何时采用**：任何生产服务 CI 强制；至少 SAST+依赖扫描；Web 应用发布前做 DAST。CI 出 critical 漏洞 → 阻断发布（非仅告警，plan §16.7）。

## 7. 混沌 / 韧性测试（L3.7）

- 故意注入故障（杀实例、加延迟）验证重试/超时/熔断（Principles of Chaos Engineering）。
- 工具：Chaos Monkey / Chaos Mesh / LitmusChaos / Gremlin。
- **何时采用**：规模化分布式系统（K8s 微服务）；单体/MVP 先聚焦基础容错（超时/重试）。

---

## 8. DoD 测试清单（任务完成时核对）

> 每个 `complete_task` 必须带回以下证据；任一项缺 → 拒绝（plan §12.2 HP3）。

- [ ] **单元测试**通过，位于金字塔底部（快速、无外部依赖）
- [ ] **覆盖率达标**：`conventions.coverage_threshold` 默认 ≥ 80%，核心模块可更高
- [ ] **集成测试**（如该任务涉及跨模块/IO）通过，可使用 Testcontainers
- [ ] **契约测试**（如涉及冻结接口边界）通过
- [ ] 涉及变更持久化 → 含**迁移测试**（up + down 可回滚，见 `db-migration-guide.md`）
- [ ] 性能敏感任务 → 提供 **NFR 基准**（延迟/吞吐符合 `nfr` 字段）
- [ ] 关键安全面（输入校验/鉴权）→ **SAST + 依赖扫描**本地已跑，无新 critical
- [ ] 测试数据取自 fixture/工厂，**不污染生产数据**
- [ ] **无 flaky 偶发**：偶发失败按 `flaky-test-protocol.md` 隔离/quarantine，禁止"重跑绿了就当过了"
- [ ] 测试随任务提交，锁文件（lockfile）在仓库内（可复现构建）

## 9. 验收对照（Phase 3）

`anti-shortcut-workflow` 在此逐条对照本清单 + `code-quality-rules.md`；有工具证据才进 Phase 4。外部依赖 mock 通过的，在 `blocks` 表记为独立 blocked task，交付前必须清零或显式豁免——**mock 通过 ≠ 集成通过**（plan §0.3 纪律 2）。
