# 部署清单（Deploy Checklist）

> 来源：`project-architecture.zh.md` 第 4 层（L4）部署 + `ai-coding-lifecycle-plan.md` §8.2。
> 用途：Phase 4 交付前的部署门控（配合 `skeleton-template.md`、`ci-pipeline-template.md` 缺口补充）。

---

## 1. 容器化：Docker 多阶段（L4.1）

模式：在臃肿阶段构建，只拷贝产物进精简运行阶段；非 root 运行；固定基础镜像版本。来源 [docs.docker.com/build/building/multi-stage](https://docs.docker.com/build/building/multi-stage)。

```dockerfile
# 示例：Node 多阶段
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

- [ ] 多阶段构建，最终镜像仅含运行产物
- [ ] 以**非 root** 用户运行
- [ ] 基础镜像**固定版本**（非 `latest`）
- [ ] 真实密钥**不进镜像**（plan §16.7）

## 2. Docker Compose（本地/轻量编排）

- [ ] `docker-compose.yml` 编排服务 + 依赖（DB/Redis/代理）
- [ ] 配置经环境变量注入，非写死
- [ ] 卷持久化数据库数据

## 3. 编排：K8s / Helm（L4.2）

- [ ] Kubernetes 部署 + 服务 + Ingress（kubernetes.io/docs）
- [ ] **Helm** 打包/部署（helm.sh）
- [ ] 资源 requests/limits、存活/就绪探针、滚动更新策略
- [ ] 托管替代：ECS/Fargate（无 K8s 控制面）、Nomad

## 4. CI/CD 流水线（L4.3）

阶段顺序（与 `ci-pipeline-template.md` 对应）：**build → lint → test → scan → deploy**。

- [ ] 每次变更自动 build → test → deploy
- [ ] build 之后跑 lint（formatter + linter，见 `code-quality-rules.md`）
- [ ] test 含单元 + 集成 + 覆盖率门槛（见 `testing-requirements.md`）
- [ ] **scan**：SAST + 依赖扫描 + 密钥扫描；critical 漏洞**阻断**发布
- [ ] deploy 仅来自受保护分支/标签
- [ ] 工具：GitHub Actions / GitLab CI / CircleCI / Jenkins

## 5. 渐进式交付：蓝绿 / 金丝雀（L4.3）

- [ ] 蓝绿（零停机切换）或金丝雀（小流量验证）
- [ ] 工具：Argo Rollouts / Flagger
- [ ] 失败时**自动回滚**判定

## 6. 云 / PaaS / Serverless（L4.4）

- [ ] 选定计算位置：AWS/GCP/Azure 全广度 / Vercel/Netlify/Render（PaaS）/ Lambda 等（serverless）
- [ ] 静态前端可由平台构建，免 Docker
- [ ] 事件驱动/尖峰/低基线 → serverless

## 7. 反向代理 / API 网关（L4.5）

- [ ] 前门：Caddy（自动 TLS）/ Traefik（K8s 发现）/ Kong（网关插件）/ Nginx
- [ ] TLS 终止、路由、负载均衡、压缩
- [ ] 可选：认证 / WAF 在边缘

## 8. 基础设施即代码（L4.6）

- [ ] 环境用受版本控制的代码定义（Terraform/OpenTofu / Pulumi / Ansible）
- [ ] 经同行评审的基础设施变更
- [ ] 通过重建实现灾备

## 9. 环境与特性开关（L4.7）

- [ ] 独立环境：**dev → staging → prod**，尽量对等（开发/生产对等，12-Factor）
- [ ] 至少拥有 **staging + prod**
- [ ] 特性开关解耦部署与发布（Unleash / LaunchDarkly / 自有配置驱动）
- [ ] 需要金丝雀/百分比 rollout/AB → 采用开关平台

---

## 10. 部署门控清单（Gate）

> Phase 4 交付前逐项核对；未过则 `handoff` 被拒（plan §4 Phase 4）。

- [ ] Dockerfile 多阶段 + 非 root + 固定版本 ✓
- [ ] CI 全绿：build → lint → test(含覆盖) → scan，无阻断项 ✓
- [ ] 配置经 12-Factor 环境变量注入，无硬编码 ✓
- [ ] 密钥来自密钥管理器，未入 git/镜像（密钥扫描通过）✓
- [ ] IaC 已应用，环境可重建 ✓
- [ ] staging 已通过 smoke + 集成验证 ✓
- [ ] 渐进式交付策略 + 回滚路径已定义 ✓
- [ ] 特性开关/配置已就位（按需）✓
- [ ] 可观测性/告警已在目标环境接入（见 `ops-checklist.md`）✓
- [ ] **release_signoff** 审批通过（plan §16.3）✓
