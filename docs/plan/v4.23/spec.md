# v4.23 规格：会扛事

> 状态：已冻结（2026-11-23）
> 上游：[README.md](./README.md) · [contracts.md](./contracts.md) · [tasks.md](./tasks.md)
> 一句话：把已落库的节点终态变成 checkpoint，让中断的运行能安全续跑；把重试、退避与超时写成节点级策略，默认不改变行为。

## 1. 目标与非目标

### 目标

| 编号 | 目标 | 验收 |
|---|---|---|
| G1 | 节点级 checkpoint | 能从 `node_executions` 重建作用域、节点状态与条件分支边 |
| G2 | 自动续跑 | 重启后安全的中断运行自动续跑并完成，无需人工 |
| G3 | 风险保护 | 写/危险工具、human、agent 在途时保持 `interrupted`，不自动重放 |
| G4 | 重试与退避 | 节点可配置尝试次数与指数退避；不可重试错误立即失败 |
| G5 | 节点超时 | 非交互节点可配置超时，超时按失败收敛 |
| G6 | 默认不变 | 未配置策略、未发生中断时，事件序列与 v4.22 一致 |
| G7 | 零迁移 | 复用现有表；备份格式与 `LATEST_SCHEMA_VERSION` 不变 |

### 非目标

- 不做分布式执行、跨进程协程复活、远程 Worker；
- 不做 cron / webhook / 文件监听触发；
- 不做工作流跨版本迁移或图结构变更；
- 不新增事件类型；
- 不自动重放 chat 触发或已被用户取消的运行。

## 2. 现状与差距

| 域 | 现状 | 差距 |
|---|---|---|
| 运行恢复 | [recovery-scanner.ts](../../../packages/core/src/flow/queue/recovery-scanner.ts) 把在途运行收敛为 `interrupted`，`queued` 重新入队 | `interrupted` 不续跑 |
| 节点产出 | [run-store.ts](../../../packages/core/src/flow/run/run-store.ts) 把 `outputs_json` 同步写入 `node_executions` | 未作为 checkpoint 使用 |
| 节点重放 | `resumedFromNode` + 祖先闭包重放的是一次新运行 | 原运行无法从断点继续 |
| 重试 | 无节点级重试；模型侧只有备用链 | 瞬时错误直接终止运行 |
| 超时 | 工具与联网有各自预算 | 节点级无统一超时 |
| 幂等 | v4.22 运行内 `${runId}:${nodeId}` | 跨重启未生效 |

## 3. 方案

### 3.1 checkpoint 重建

续跑不新增存储，直接从现有两张表重建：

```text
workflow_runs.input_json        → start 节点的 params
node_executions(status,outputs) → state + scope
condition 节点的 outputs.result → liveEdges
```

重建顺序：

1. 读取该运行全部节点执行记录，按 `nodeId` 建索引；
2. `succeeded` → `state=succeeded`，`scope[nodeId]={outputs}`；start 额外挂 `params`；
3. `skipped` → `state=skipped`；
4. `running` → 不预置，交给恢复决策；
5. condition 节点按 `result` 激活对应出边。

进入引擎时以 `checkpoint` 选项传入，引擎初始化后静默跳过已落定节点，不补发事件。

### 3.2 启动恢复决策

恢复扫描从「全部收敛 interrupted」改为「先判定再分流」：

| 场景 | 决策 | 原因码 |
|---|---|---|
| `queued` 残留 | 重新入队（维持现状） | — |
| `waiting_human` | 续跑，重新进入 human 等待 | `waiting_human` |
| `running`，在途节点为安全类型 | 续跑，重执行该节点 | `safe_in_flight` |
| `running`，在途节点为 human / agent / 写危险 tool | 保持 `interrupted` | `unsafe_in_flight` |
| 运行版本已不存在或编译失败 | 保持 `interrupted` | `version_missing` |
| `trigger=chat` | 保持 `interrupted` | `chat_request_gone` |
| 无任何已开始节点 | 续跑（等价从头执行） | `empty_checkpoint` |
| 用户已取消 | 不处理 | — |

安全类型与并行白名单一致：`llm`、`knowledgeSearch`、`condition`、只读 `tool`、`end`、`start`。
`waiting_human` 视为安全：节点在等待输入，没有副作用在执行。

续跑时运行状态从 `interrupted → queued`，记录 `resume_reason` 到运行错误快照或事件，不新增列。

### 3.3 重试与退避

节点 `config` 新增可选策略（不新增图字段）：

```ts
interface FlowNodePolicy {
  retry?: {
    maxAttempts?: number;   // 1–5，默认 1（不重试）
    backoffMs?: number;     // 100–60000，默认 1000
    maxBackoffMs?: number;  // 100–120000，默认 30000
  };
  timeoutMs?: number;       // 1000–600000；缺省不超时
}
```

- 仅对**节点执行体抛出的错误**重试；引用解析、参数校验、权限拒绝不重试；
- 退避：`min(backoffMs * 2^(attempt-1), maxBackoffMs)`，不引入随机抖动，保证可复现；
- 尝试次数包含首次执行；
- 每次重试重新发 `node_started`，带 `attempt`；最终失败的 `node_failed` 也带 `attempt`；
- 并行调度下重试占用同一个并发槽位，不额外扩容。

超时：

- 仅对非交互节点生效：`llm`、`knowledgeSearch`、只读 `tool`、`end`；
- `human`、写/危险 `tool`、`agent` 忽略 `timeoutMs`（避免授权与长任务被误杀）；
- 超时按节点失败处理，消息含「超时」与毫秒数；底层执行体不强制中断，但结果被忽略。

### 3.4 幂等边界

| 节点状态 | 续跑行为 |
|---|---|
| `succeeded` | 不执行，复用落库输出 |
| `skipped` | 不执行，维持 skipped |
| `running`（安全类型） | 允许重执行一次，至少一次语义 |
| `running`（风险类型） | 不自动续跑，保持 interrupted |
| 未开始 | 正常调度 |

副作用边界：写/危险工具一旦进入执行就视为风险在途，重启后交给人工重放；只读工具允许重放。

### 3.5 事件兼容

| 事件 | 变更 |
|---|---|
| `run_started` | 新增可选 `resumed?: boolean`、`resumeReason?: string` |
| `node_started` | 新增可选 `attempt?: number`（首次省略） |
| `node_failed` | 新增可选 `attempt?: number` |
| 其他事件 | 不变 |

不新增事件类型；旧读取方忽略新字段即可。已成功节点在续跑时不补发事件。

### 3.6 兼容与回滚

- 未配置 `retry/timeoutMs` 时走原执行路径，事件序列与 v4.22 一致；
- 自动续跑只在启动恢复阶段发生，可整体关闭（恢复策略常量）；
- 无数据库迁移；回退代码后，残留的 `queued` 运行按旧逻辑执行。

## 4. 验收清单

### 自动

- `pnpm check`；
- `pnpm verify:local`；
- 定向单测：
  - checkpoint 重建：succeeded/skipped/condition 三类形态；
  - 恢复决策矩阵：安全/风险/waiting_human/版本缺失；
  - 重试：次数、退避序列、不可重试错误；
  - 超时：生效节点与忽略节点；
  - 续跑幂等：已成功工具不重复调用；
  - 回归：未配置策略的事件序列与 v4.22 一致。

### 手测

| 场景 | 断言 |
|---|---|
| 运行中关闭应用再启动 | 安全运行自动续跑完成，已成功节点不重复执行 |
| 写工具确认弹窗期间关闭应用 | 运行保持 interrupted，提示可人工重放 |
| 节点配置 `maxAttempts=3`，前两次失败 | 第三次成功则运行成功；三次失败则 run_failed |
| 节点配置 `timeoutMs=2000`，执行 5 秒 | 节点按超时失败，运行按策略收敛 |
| 既有流程不配置策略 | 事件序列与 v4.22 一致 |
