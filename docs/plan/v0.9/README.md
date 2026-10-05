# Flow Serving —— 工作流服务化 · 新增功能方案总览（v0.9）

> 版本：v1（对应 workBuddyForMe v0.8.0 基线，main commit 1930d30）
> 日期：2026-10-05
> 状态：待评审
> 路线图：[v0.9-flow-serving.md](../../roadmap/v0.9-flow-serving.md)
> 上一版方案：[v0.8 Flow Studio P0–P2](../README.md)（P0 已在 v0.8 落地，本方案实施其 P1）

---

## 1. 一句话方案

把 v0.8「连接即运行」的工作流执行模型重构为「**落库即运行**」：queued 运行由进程内 runner 独立拾取，SSE 退化为可插拔的观察者；在此之上把已发布流程通过**带密钥的本地 HTTP API** 与 **MCP Server（stdio + streamable HTTP）** 暴露给外部程序，并建立无人值守触发下的危险操作安全策略。

## 2. 为什么做：v0.8 的三道墙

基于对 v0.8.0 代码的实读（详见 [01-现状与差距分析.md](./01-现状与差距分析.md)）：

1. **运行被 SSE 连接锁死**：`FlowRunService` 的 active Map 与 AbortController 绑定在 `startEvents` 的调用生命周期里，订阅断开=运行取消；外部程序无法「提交后离开，稍后取结果」。
2. **进程重启即僵尸**：queued/running 状态只在内存有执行者，数据库行在重启后永久停在旧状态，无恢复扫描。
3. **能力只进不出**：`packages/core/src/mcp` 只有 client/registry，虽然 jsonrpc 编解码已自实现（`jsonrpc.ts`），但没有 server 端；外部程序无法以标准协议发现/调用流程。

这三点正是 v0.8 roadmap 明确给 v0.9 的交接棒（§6「长运行与 SSE 连接绑定，无法无人值守 → run/node_executions 先行落库，v0.9 做落库 queued + 独立 runner」）。

## 3. 目标与非目标

### 目标

| 编号 | 目标 | 衡量方式 |
|---|---|---|
| G1 | 执行与连接解耦 | API 提交异步运行后断开 HTTP，运行继续到终态；两个 SSE 观察同一 run 看到一致事件 |
| G2 | 崩溃可恢复 | 执行中杀进程重启：queued 重新入队、running 标 interrupted 且可重跑，无僵尸行 |
| G3 | 本地 HTTP API | curl + bearer 同步/异步调通已发布流程；密钥可重置；越权 401；限流生效 |
| G4 | MCP Server 暴露 | MCP 客户端 initialize/tools/list/tools/call 成功；WorkBuddy 自举连接调通一次 |
| G5 | 无人值守安全 | API/MCP 触发默认拒绝危险操作；allowlist 策略随发布版本固化；审计可查 |
| G6 | 零回归 | v0.8 试运行（manual）与对话（chat）链路行为不变，55+ flow 单测与全量门禁全绿 |

### 非目标（本版本明确不做）

- 定时/事件自动化（v0.10，Electron scheduler 消费本版本的 queued 机制）
- 公网暴露/隧道/云托管/多用户；Webhook 出站回调
- 跨进程分布式队列锁；真正断点续跑（复用历史 outputs 跳过上游，本版本重跑=重放上游段）
- 同层并发、subflow、循环；MCP tools 之外的能力（resources/prompts）

## 4. 方案范围（五个里程碑）

| 阶段 | 主题 | 核心交付 |
|---|---|---|
| M0 | 契约与迁移 | v013（workflow_endpoints + runs 增列）、trigger/策略/interrupted 契约、endpoint 仓储 |
| M1 | 执行解耦 | FlowRunQueue（拾取/pub-sub/认领事务）、启动恢复、run-service 调度执行拆分 |
| M2 | HTTP API | `/api/public/**` bearer 路由组、同步/异步/轮询/只读 SSE、限流、端点管理 UI |
| M3 | MCP Server | jsonrpc server（stdio + http 承载）、流程→tool 映射、桌面打包入口、自举验证 |
| M4 | 策略与收尾 | 无人值守 deny/allowlist、发布危险提示、运行记录与重跑 UI、0.9.0 发布 |

详见 [04-实施路线与风险.md](./04-实施路线与风险.md)。

## 5. 关键设计决策（预告）

- **引擎零改动，只动调度层**：compiler/refs/engine/7 handlers 与单 run 内挂起协议完全不碰；队列只决定「何时、以什么 trigger 执行哪个 queued run」。v0.8 的 55 个 flow 测试是重构安全网。
- **单进程单执行者 + 事务认领**：桌面/本地 server 本就是单实例，不引入分布式锁；用 `UPDATE workflow_runs SET status='running' WHERE id=? AND status='queued'` 的原子认领防重复拾取；pub/sub 只扇出不可变事件快照。
- **公开路由与会话路由物理隔离**：`/api/public/**` 不走会话鉴权链，强制 bearer + Host 校验 + 不接受 cookie（天然免疫 CSRF/DNS rebinding）。
- **MCP server 复用 v0.6 jsonrpc 资产生成面极小**：只实现 initialize/initialized/tools/list/tools/call，stdio 与 streamable HTTP 共用同一套处理器函数。
- **危险策略是发布版本的一部分**：策略写在发布快照上不可运行时篡改；allowlist 永久排除桌面控制工具（mouse/keyboard/window/app_launch）。

## 6. 文档导航

| 文档 | 内容 |
|---|---|
| [01-现状与差距分析.md](./01-现状与差距分析.md) | v0.8 执行链路实读、可复用资产（jsonrpc/token-guard/server-manager）、差距矩阵 |
| [02-功能设计.md](./02-功能设计.md) | 用户故事、端点/密钥/策略模型、API 与 MCP 交互流程、运行恢复与重跑语义 |
| [03-技术架构设计.md](./03-技术架构设计.md) | 队列状态机、v013 表结构、API 契约、MCP server 结构、安全模型、模块划分 |
| [04-实施路线与风险.md](./04-实施路线与风险.md) | M0–M4 任务拆解、验收标准、测试策略、风险对策 |

## 7. 成功判据

1. curl 同步调用 200 返回 output；异步调用返回 runId，轮询至终态结果一致；错误密钥一律 401；超配额返回 429；
2. `kill -9` 服务进程后重启，旧 queued 运行自动续跑、旧 running 被标 interrupted 并可重跑成功；
3. 用 MCP inspector/自举连接完成 initialize → tools/list → tools/call 全链路；
4. 含 fetch_webpage 的流程经 API 调用默认失败（policy_deny），配置 allowlist 并重新发布后调用成功，node_executions 留策略判定；
5. 浏览器中 v0.8 画布试运行（含人工挂起）与对话调用 flow 工具行为与 v0.8 完全一致；
6. `pnpm check` 全绿，新增模块单测齐备，版本号 0.9.0 + tag 发布。
