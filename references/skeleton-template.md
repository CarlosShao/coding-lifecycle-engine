# 仓库骨架与规划模板（Skeleton & Planning）

> 来源：`project-architecture.zh.md` 第 1 层（L1）骨架与规划 + `ai-coding-lifecycle-plan.md` §8.2 / §13。
> 用途：Phase 0/1 仓库结构、分支、ADR、12-Factor、密钥的约定模板。

---

## 1. 仓库策略：monorepo vs polyrepo

| 策略 | 优点 | 缺点 | 适用场景 |
|---|---|---|---|
| **Monorepo** | 跨项目原子变更；共享库；统一工具链/CI；大规模重构易 | 需工作区工具保速；坏提交影响面大；朴素 CI 慢 | 多个紧密耦合服务/应用；共享内部库；一个/同盟团队 |
| **Polyrepo** | 强隔离；独立 CI/所有权/权限；清晰边界 | 难共享代码；跨领域变更分散到多 PR | 松耦合服务；多独立团队；严格所有权/安全边界 |

**判据**（L7）：一个产品一个团队 → monorepo；多团队严格边界 → polyrepo + GitFlow。

## 2. 工作区 / 构建编排工具（monorepo 必备）

- **Turborepo**（Vercel）—— JS/TS 优先，低配置，缓存快。
- **Nx** —— 框架无关（JS/Go/Java），丰富任务图、受影响命令检测、代码生成。
- **Bazel** —— 超大规模、语言无关、密封式可复现；学习曲线陡。

**何时采用**：JS/TS 小团队 → Turborepo；更大/多语言/插件重 → Nx；超大规模 → Bazel。polyrepo 一般不需要。

## 3. 目录布局约定（按领域组织，非按类型平铺 —— G11）

```text
# 全栈 monorepo（Turborepo/Nx）示例
my-app/
├── apps/
│   ├── web/            # 前端 (Next/Nuxt)
│   ├── api/            # 后端服务
│   └── admin/          # 管理后台
├── packages/
│   ├── ui/             # 共享组件库
│   ├── db/             # 数据访问层 + 迁移
│   ├── config/         # 12-Factor 配置加载
│   └── shared-types/   # 前后端共享类型/契约
├── tooling/
│   └── eslint-config/  # 共享 lint 规则
├── infra/              # IaC (Terraform/Pulumi)
├── .github/workflows/  # CI/CD
├── .env.example        # 配置占位（绝不提交真实 .env）
├── README.md
├── CONTRIBUTING.md
├── package.json        # workspaces / turbo.json
└── docker-compose.yml
```

```text
# 单语言服务（Go/Rust/Python）示例
service/
├── cmd/<svc>/main.go       # 入口
├── internal/
│   ├── auth/               # 按领域分层（R6）
│   ├── db/
│   └── handler/
├── pkg/                    # 可导出公共 API（Go5 注释）
├── api/                    # OpenAPI / proto 契约
├── migrations/             # DB 迁移
├── tests/                  # 集成/契约测试
├── configs/                # 配置模板
├── Dockerfile              # 多阶段
└── .env.example
```

## 4. 分支与发布流程

| 流程 | 特点 | 适用 |
|---|---|---|
| **Trunk-Based** | 短生命周期分支，频繁合 main，依赖 CI + 特性开关 | 小团队、高频部署（DORA 推荐） |
| **GitHub Flow** | main + 短特性分支 + PR + 从分支部署 | 持续部署 |
| **GitFlow** | main/develop + feature/release/hotfix | 多版本并行、按计划发布 |

**判据**：小团队频繁部署 → Trunk-Based/GitHub Flow；维护多版本按计划发布 → GitFlow。

## 5. ADR 模板（架构决策记录）

> 格式来源 Michael Nygard：Status / Context / Decision / Consequences。每一个重大、难逆转的选择都写一份。

```markdown
# ADR-NNN: <决策标题>

## Status
Proposed | Accepted | Superseded by ADR-NNN

## Context
<是什么问题/约束促使此决策？背景、力量、事实。>

## Decision
<我们决定做什么，明确且不可逆。>

## Consequences
<正面与负面后果；后续动作；回滚成本。>

## Alternatives Considered
<曾被考虑的替代方案及其被否理由。>
```
存储于 `docs/adr/` 下，受版本控制，只追加。

## 6. 12-Factor 配置

- **在环境中存储配置**：随部署变化的配置放环境变量，绝不写进代码（[12factor.net/config](https://12factor.net/config)）。
- 支撑服务视为附加资源；构建/发布/运行严格分离；开发/生产对等。
- `.env` 仅本地用，生产经平台/密钥管理器注入；真实 `.env` 加入 `.gitignore`。

`.env.example` 模板：
```bash
# 服务
APP_PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/app   # 占位，真实值从密钥管理器注入
LOG_LEVEL=info
# 特性开关
FEATURE_NEW_UI=false
# 第三方（密钥用占位名，绝不填真实值）
STRIPE_API_KEY=__SECRET_STRIPE_API_KEY__
```

## 7. 密钥管理

- **平台密钥存储**：AWS Secrets Manager / GCP Secret Manager / Azure Key Vault（IAM 作用域、可审计）。
- **HashiCorp Vault**：动态密钥、租约、多云。
- **CI 密钥变量**：GitHub Actions / GitLab CI 加密密钥（方便，非完整生命周期）。
- **铁律**（plan §16.7）：AI 永不直接看到真实密钥，只看到占位符；密钥注入发生在部署/运行时，不进代码也不进 prompt。
- **绝不要**将密钥存入源码控制或容器镜像。CI 强制密钥扫描（gitleaks/TruffleHog）。
