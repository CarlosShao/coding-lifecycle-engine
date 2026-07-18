# 技术栈选型速查表（Stack Decision Guide）

> 来源：`project-architecture.zh.md` 第 7 层（L7）选型决策指南 + 第 2/4/5 层速查。
> 用途：Phase 0/1 的栈决策（配合 `skeleton-template.md`、`code-quality-rules.md`）。
> 与第 7 层详述搭配使用；下方为"何时选什么"的判定表。

---

## 1. 语言选择（L2.1）

| 语言 | 最适合 | 规范权威来源 |
|---|---|---|
| **TypeScript / JS** | Web 前端、Node 后端、全栈 | eslint + prettier；TS 手册 |
| **Python** | 数据、ML、脚本、快速 API | PEP 8；ruff；black；poetry/uv |
| **Go** | 高并发服务、CLI、基础设施 | effective_go；gofmt |
| **Rust** | 性能关键、内存安全系统 | rust style-guide；rustfmt+clippy |
| **Java / Kotlin** | 企业后端、Android | Oracle 约定；Spring Boot |
| **C# / .NET** | 企业、Windows 为中心、Unity | dotnet 约定 |

**判据**：富 UI 的 Web → TS 全栈（前端 + Node）。数据/ML 重 → Python 后端。延迟/吞吐关键 → Go 或 Rust。受监管企业 → Java/Kotlin 或 C#。避免无清晰边界理由地混用过多语言。

## 2. 前端框架（L2.2）

| 选择 | 适用 |
|---|---|
| **React + Next.js** | 最大生态/库支持、团队可用性 |
| **Vue + Nuxt** | 平缓上手、清晰约定 |
| **Svelte / SvelteKit** | 最小包体积、编译器模型 |
| **Angular** | 强约束结构的大型企业 |

元框架（Next/Nuxt/SvelteKit/Remix/Astro）提供 SSR/SSG + 路由 + API 路由。

## 3. 后端框架（L2.3）

| 语言 | 选项 | 选谁 |
|---|---|---|
| Node | Express / NestJS / Fastify | 需结构 → NestJS；极简 → Express；快 → Fastify |
| Python | FastAPI / Django / Flask | OpenAPI/异步 → FastAPI；后台/ORM → Django；极简 → Flask |
| Go | net/http / Gin / Fiber | 速度 → Gin/Fiber；简单 → 标准库 |
| Rust | Axum / Actix | 现代 → Axum |
| Java / C# | Spring Boot / ASP.NET Core | 企业事实标准 |

## 4. 数据与中间件（L2.5）

| 需求 | 选型 | 何时 |
|---|---|---|
| 关系 OLTP | **PostgreSQL**（默认）/ MySQL | 强一致 + 关系 → PG |
| 灵活 schema | MongoDB | 快速迭代 |
| 缓存 | **Redis** | 热读路径前置缓存 |
| 消息/流 | Kafka（规模）/ RabbitMQ（路由）/ NATS | 异步工作流/事件溯源 |
| 搜索 | Meilisearch/Typesense（起步）→ Elasticsearch（规模） | 搜索即功能 |
| 对象存储 | S3 / MinIO（自托管） | 文件/媒体 |
| 认证 | 提供方 OIDC（Auth0/Keycloak/Cognito） | 登录，不自造轮子 |

## 5. API 风格（L2.7）

| 场景 | 选型 |
|---|---|
| 公开/第三方、广泛客户端 | **REST + OpenAPI** |
| 数据需求多样、富客户端 | **GraphQL** |
| 内部高性能微服务 | **gRPC** |
| 仅 TS 全栈 | **tRPC**（端到端类型安全） |

## 6. 部署（L4）

| 能力 | 选型 | 何时 |
|---|---|---|
| 容器 | **Docker 多阶段** | 后端/服务几乎总是 |
| 编排 | **K8s + Helm**（控制）/ ECS Fargate / Nomad（托管） | 需最大控制 → K8s；少运维 → 托管 |
| CI/CD | **GitHub Actions / GitLab CI**；自托管 → Jenkins | 与代码同处原生匹配 |
| 渐进式交付 | **Argo Rollouts / Flagger**（蓝绿/金丝雀） | 频繁部署且无法承受全量中断 |
| 云/PaaS | Vercel/Netlify/Render（Web）；AWS/GCP/Azure（全广度） | 零基础设施 Web → PaaS |
| Serverless | Lambda / Cloud Functions / Workers | 事件驱动、尖峰、低基线 |
| 代理/网关 | Caddy（简单）/ Traefik（K8s）/ Kong（网关） | TLS 终止、路由、负载均衡、WAF |
| IaC | **Terraform/OpenTofu**（云无关）/ Pulumi（语言编码）/ Ansible | 多云 → TF；语言偏好 → Pulumi |
| 特性开关 | Unleash / LaunchDarkly（需要金丝雀/AB） | 部署与发布解耦 |

## 7. 测试（L3）

| 范围 | 选型 | 何时 |
|---|---|---|
| 单元 | pytest / Jest / Vitest / 语言内置 | 永远 |
| 集成/契约 | Pact（消费者驱动）/ Testcontainers | 独立部署节奏的多服务 |
| 负载 | k6 / Artillery / Gatling | 发布前 + 常态 |
| 安全 | SAST（CodeQL/Snyk）+ 依赖扫描 + 密钥扫描 | CI 强制 |
| 混沌 | Chaos Mesh / LitmusChaos | 规模化分布式 |

## 8. 运维（L5）

| 能力 | 选型 |
|---|---|
| 可观测性基线 | **OpenTelemetry + Prometheus + Grafana + Loki** |
| 错误追踪 | **Sentry**（起步）→ Datadog/New Relic（规模） |
| 度量 | **DORA 指标**；定义 **SLO**，告警接 on-call |
| 安全 | CI 中 **Snyk/Dependabot/CodeQL** + WAF + 早规划 SOC2/GDPR |
| 备份/DR | 经测试备份 + 多可用区从第 1 天；企业级 DR 计划 |
| 事件 | **Google SRE IR** + 无指责 postmortem + runbook + 状态页 |

## 9. 成熟度成长路径（L6）

| 阶段 | 选型姿态 | 升级触发点 |
|---|---|---|
| **MVP** | 一个技术栈（如 TS 全栈）、单 DB、PaaS 部署、基础日志+Sentry、依赖扫描+密钥管理 | 开始有真实流量预测 → 加 CI/CD + 集成测试 |
| **Commercial** | 1–2 栈、Postgres+缓存+MQ+搜索、容器+CI/CD（可能 K8s）、Prometheus/Grafana+APM+SLO、SAST/DAST+WAF | >~10 可部署服务或 PaaS 受限 → K8s；on-call 被动 → 正式 SLO |
| **Enterprise** | 多栈治理、多语言持久化/分片、K8s/IaC+渐进式交付+多区域、完整 OTel+on-call+runbook、SOC2/GDPR+漏洞管理+审计+IR | 企业销售需要 → SOC 2；合同约束可用性 → 正式 RTO/RPO |

**核心原则**：在*痛点*而非日历上触发升级，避免 MVP 过度工程（3 人团队上 K8s+服务网格）或商业规模忽略 SLO/备份。
