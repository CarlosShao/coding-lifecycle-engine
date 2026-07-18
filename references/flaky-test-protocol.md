# Flaky Test Protocol

> 机制文件 · 偶发/间歇失败的测试如何处理。**铁律：绿色重跑 ≠ 通过。** 禁止用"再跑一次绿了"当作验收证据。

## 1. 判定：什么是 flaky

- 同代码、同环境，多次运行结果**不一致**（有时绿有时红）。
- 典型信号：只在 CI 并发时失败、只在慢机器失败、只在特定顺序下失败、依赖时钟/随机/网络。

## 2. 标准处置流程

### Step 1 — 重跑 N 次（确定性判定）

- 隔离运行该测试 **N = 5 次**（CI 可设 `flaky_reruns=5`），固定顺序、禁并发。
- 记录每次结果。
- 若 5 次中有 ≥1 次失败 → **判定为 flaky，进入 Step 2**。绝不看"最后一次绿"就放行。

### Step 2 — 隔离与 quarantine

- 将该测试移入 **quarantine 集**（独立 tag/目录，如 `@quarantine` 或 `tests/quarantine/`），从主门禁 CI 移除。
- quarantine 测试**不计入**发布达标（release_readiness 的 `tests_green` 仅指非 quarantine 集）。
- 在 `tasks` / 缺陷跟踪中建 `type='bug'`（source=`test_failure`）单独跟踪，severity 按影响定（med 起，影响核心链路升 high）。
- 记录：测试名、失败频率、最近一次失败日志、环境（OS/并发/时长）。

### Step 3 — 根因隔离（不要只 quarantine 就完）

quarantine 是止血，不是修复。必须追根因：

| 怀疑方向 | 排查动作 |
|---|---|
| 测试间共享状态 | 查全局单例/静态/模块级可变变量；改为每测试重建 fixture（见 `test-fixtures-guide.md`） |
| 执行顺序依赖 | 用 `--randomize` 跑；查测试是否假设先于/后于某测试 |
| 异步竞态 | 查未 await、未 flush、定时器；加确定性等待/假时钟 |
| 时间/随机 | 注入假时钟（fake timers）、固定 seed |
| 并发资源 | 查端口/文件/DB 行冲突；改用唯一资源或事务隔离 |
| 真实产物 bug | 若根因是产品代码竞态 → 这是真 bug，按 `bug-handling-track.md` 走，不归 flaky |

## 3. 禁止项

- ❌ 把 "green after rerun" 当 pass 写进验收证据。
- ❌ 直接 `@skip` / `xdescribe` 永久注释掉而不建 bug 跟踪。
- ❌ 在测试里加 `sleep` 掩盖竞态（掩盖，不修复）。
- ❌ 调大 timeout 当"修好"（除非确认是环境慢且记录）。

## 4. 修复后回归

- 根因修复后，将测试**移出 quarantine** 回主集。
- 移出前：在主集连续绿 ≥ 10 次（含并发 CI 跑）才认定稳定。
- 修复须带测试或注释说明根因，防止复发。

## 5. 记录

- quarantine 项清单常驻可见（状态查询可列）。
- 每次 quarantine/修复移出写入 `events`，供跨会话审计：哪测试不稳定、修了没、什么时候修的。
