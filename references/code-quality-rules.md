# 代码质量规则（核心文件）

> 来源：`ai-coding-lifecycle-plan.md` §9 代码质量规则详设（核心产出）。
> 这是文档最大的缺口，也是被 AI 折磨最狠的地方。**每一条都是硬约束（HARD GATE），不是建议。**
> 规则经 `conventions.quality_rules`（JSON）落地，由 `get_conventions(task_id, scope='core'|'full')` 注入。

**关键原则**：不是"提示 AI 注意"，是**四道机械闸门**——AI 想糊弄也过不去（见 §9.7）。`complete_task` 强制校验 DoD + 测试证据 + 质量规则；验收阶段 `anti-shortcut-workflow` 逐条对照全集。

---

## 1. 通用规则（所有语言）G1–G12

| # | 规则 | 强制方式 |
|---|---|---|
| G1 | 单一职责：一个文件/模块/函数只做一件事 | 审查 + 行数上限代理 |
| G2 | 单文件行数上限（语言相关，见下） | lint `max-lines` / CI 脚本 |
| G3 | 单函数行数上限 | lint 复杂度规则 |
| G4 | 嵌套深度上限 ≤ 4 | lint `max-depth` |
| G5 | 函数参数 ≤ 4（超过用对象/结构体） | lint `max-params` |
| G6 | 禁止魔数，用命名常量 | lint / 审查 |
| G7 | 命名有语义（禁 data/temp/handle/foo） | 审查 |
| G8 | 所有外部输入必须校验边界 | 审查 + 安全 checklist |
| G9 | 错误必须显式处理（禁空 catch/裸 unwrap） | lint（见语言组） |
| G10 | 公共 API 必须有文档注释 | lint `missing_docs` |
| G11 | 目录按模块/领域组织，非按文件类型平铺 | 结构检查脚本 |
| G12 | 圈复杂度上限 | lint `complexity` |

---

## 2. Rust R1–R8

| # | 规则 | 上限/要求 | AI 反例 | 强制 |
|---|---|---|---|---|
| R1 | 单文件 ≤ 300 行 | hard | auth.rs 800 行混业务+DB+验证 | CI 脚本 |
| R2 | 单函数 ≤ 40 行 | soft warn / 60 hard | handle_request 150 行 | clippy cognitive_complexity |
| R3 | 禁裸 unwrap/expect（测试除外） | deny | config.get().unwrap() 崩溃 | `clippy::unwrap_used` deny |
| R4 | 错误用 thiserror/anyhow 定义类型 | 所有 fallible | String/Box<dyn Error> | 审查 + clippy |
| R5 | pub 项必须 doc comment | 全部 | 无注释 pub | `missing_docs` warn |
| R6 | 模块清晰分层 src/auth/ src/db/ | — | 全堆 main.rs | 结构检查 |
| R7 | 禁 unsafe（除非注释论证） | deny | 无理由 unsafe | `clippy::undocumented_unsafe_blocks` |
| R8 | 优先借用而非 clone | warn | 到处 .clone() | 审查 |

**Rust 强制命令块**
```toml
# Cargo.toml → [lints.clippy] (Cargo 1.74+) 或 .cargo/config.toml
[workspace.lints.clippy]
unwrap_used = "deny"
expect_used = "deny"
undocumented_unsafe_blocks = "deny"
```

```bash
# pre-commit / CI
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings -D clippy::unwrap_used

# CI 单文件行数闸门（示例代码，超 300 行即失败）
find src -name '*.rs' | while read f; do
  n=$(wc -l < "$f")
  [ "$n" -gt 300 ] && echo "FAIL $f: $n lines (>300)" && exit 1
done
```

---

## 3. TypeScript / JavaScript T1–T9

| # | 规则 | 上限/要求 | AI 反例 | 强制 |
|---|---|---|---|---|
| T1 | 单文件 ≤ 250 行 | hard | utils.ts 600 行大杂烩 | eslint max-lines |
| T2 | 禁 any | error | const data: any | no-explicit-any error |
| T3 | 函数参数 ≤ 4 | warn/>5 error | create(a,b,c,d,e,f) | max-params |
| T4 | 嵌套 ≤ 4 层 | error | if×5 | max-depth/complexity |
| T5 | async 必须 try-catch 或 .catch | error | 裸 fetch | no-floating-promises |
| T6 | 组件单一职责 | — | Dashboard.tsx 含表格+图表+表单+CRUD | 审查 |
| T7 | 禁 as 强转（除非 unknown 收窄） | warn | res as User | 审查 |
| T8 | strict 模式全开 | — | strict:false | tsconfig 检查 |
| T9 | 禁 console.log 进生产 | error | 满屏 console | no-console(prod) |

**TypeScript 强制命令块**（`.eslintrc.cjs`）
```js
module.exports = {
  rules: {
    'max-lines': ['error', { max: 250, skipComments: true, skipBlankLines: true }],
    'max-params': ['error', { max: 4 }],
    'max-depth': ['error', { max: 4 }],
    'complexity': ['warn', { max: 10 }],
    'no-explicit-any': 'error',
    'no-floating-promises': 'error',
    'no-console': ['error', { allow: ['warn', 'error'] }],
  },
};
```
```jsonc
// tsconfig.json — T8
{ "compilerOptions": { "strict": true, "noImplicitAny": true, "noUncheckedIndexedAccess": true } }
```
```bash
# CI 闸门
npx eslint . --max-warnings=0
npx tsc --noEmit   # strict 校验
```

---

## 4. Python P1–P7

| # | 规则 | 上限/要求 | AI 反例 | 强制 |
|---|---|---|---|---|
| P1 | 单文件 ≤ 400 行 | hard | models.py 上千行 | ruff / CI |
| P2 | 全量 type hints | 公共函数 | 无类型注解 | mypy strict |
| P3 | 禁裸 except: | error | except: pass | ruff E722 |
| P4 | 函数 ≤ 50 行 | warn | 巨型函数 | ruff C901 复杂度 |
| P5 | 用 dataclass/pydantic 而非裸 dict 传数据 | — | 到处 dict["key"] | 审查 |
| P6 | 禁可变默认参数 | error | def f(x=[]) | ruff B006 |
| P7 | docstring 公共函数/类 | — | 无 docstring | ruff D |

**Python 强制命令块**（`ruff.toml` + `pyproject.toml`）
```toml
# ruff.toml
[lint]
select = ["E", "F", "B", "C901", "D"]
ignore = ["D100", "D104"]   # 私有模块/类可无 docstring
[lint.mccabe]
max-complexity = 10
[lint.flake8-bugbear]   # 间接覆盖裸 except 等
```
```bash
# CI 闸门
ruff check . --select E722,B006,C901,D   # P3/P6/P4/P7
mypy --strict src/                        # P2
```

---

## 5. Go Go1–Go6

| # | 规则 | 上限/要求 | AI 反例 | 强制 |
|---|---|---|---|---|
| Go1 | 单文件 ≤ 500 行 | soft | 巨型 file | golangci-lint |
| Go2 | 错误必须处理，禁 `_ =` 吞错 | error | _ = doThing() | errcheck |
| Go3 | 错误包装用 %w | — | fmt.Errorf 丢链 | 审查 |
| Go4 | 禁 panic 于库代码 | error | panic 代替 error | 审查 |
| Go5 | 导出标识符必须注释 | — | 无注释 export | revive |
| Go6 | context 作首参传递 | — | 不传 ctx | 审查 |

**Go 强制命令块**（`.golangci.yml`）
```yaml
linters:
  enable: [errcheck, revive, govet, gocritic]
linters-settings:
  revive:
    rules:
      - name: exported   # Go5 导出注释
      - name: context-as-argument   # Go6
issues:
  max-issues-per-linter: 0
  max-same-issues: 0
```
```bash
gofmt -l .            # 格式闸门
golangci-lint run --timeout 5m
```

---

## 6. 前端框架专项（Vue/React）F1–F5

| # | 规则 | 要求 | 强制 |
|---|---|---|---|
| F1 | 组件 ≤ 200 行，超了拆子组件 | hard | lint max-lines |
| F2 | 逻辑抽 composable/hook，不堆组件里 | — | 审查 |
| F3 | props 必须类型定义 + 校验 | — | lint |
| F4 | 禁在模板里写复杂逻辑 | — | 审查 |
| F5 | 副作用集中管理（onMounted/useEffect） | — | 审查 |

---

## 7. 四层强制模型（§9.7）

```
写码前(注入): 给 AI 该语言的 quality_rules core 子集(~15条)
写码中(lint): pre-commit 跑 formatter + linter, 挡住违规
提交前(CI):   CI 跑全量 lint + 行数检查 + 覆盖率门槛
验收时(核对): anti-shortcut-workflow 逐条对照 quality_rules 全集
```

1. **写码前注入（core，≤15 条）**：任务开始轻量注入该 language+framework 的 core 子集 + 该模块 contracts 接口 + DoD 清单。
2. **写码中 lint（pre-commit）**：formatter + linter 在提交前挡住违规。
3. **提交前 CI（全量）**：CI 跑全量 lint + 单文件行数脚本 + 覆盖率门槛（见 `testing-requirements.md`）。
4. **验收时核对（anti-shortcut）**：Phase 3 逐条对照 quality_rules 全集，有工具证据才通过。

**每任务 DoD 必含**（来自 plan §12.2 HP3）：测试通过 + 覆盖达标 + lint 过 + 质量规则过。任一道闸未过，`complete_task` 拒绝；验收 `mock 通过` 绝不写成 `集成通过`。
