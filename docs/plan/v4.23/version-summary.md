# v4.23 版本总结：会扛事

> 版本：4.23.0（2026-11-23 发布）
> 状态：✅ 已发布（tag `v4.23.0`，GitHub Release 最新版）
> 主题：Flow 持久化执行——节点级 checkpoint、启动自动续跑、重试/退避与节点超时
> 迁移：零数据库迁移；备份格式不变；无新增运行时依赖
> 博客：[blog/v4.23](../../blog/v4.23/) 7 篇
> 发行说明：[v4.23.0-release-notes.md](../../roadmap/v4.23.0-release-notes.md)
> 方案：[docs/plan/v4.23](./README.md) · 规格：[spec.md](./spec.md) · 契约：[contracts.md](./contracts.md)
> 调研：[00-能力借鉴分析.md](./00-能力借鉴分析.md)

## 1. 本版解决什么

v4.22 让流程能并行跑，但进程级故障仍停在原地：

1. 启动恢复只把在途运行收敛为 `interrupted`，已成功节点的产出没有被当作续跑依据；
2. 瞬时错误（模型抖动、检索超时）直接终止整个运行，没有节点级重试；
3. 节点没有统一超时，长尾调用只能靠用户手动取消；
4. 崩溃时正在执行的写操作没有幂等边界，无法安全重放。

v4.23 不新增存储模型，把已有的 `node_executions` 变成 checkpoint，并按安全矩阵决定「哪些跑可以自己爬起来」。

## 2. 里程碑结果

| 阶段 | 结果 |
|---|---|
| M0 契约冻结 | checkpoint 结构、恢复安全矩阵、重试/超时字段、幂等边界与事件字段 |
| M1 checkpoint 重建 | 从 `workflow_runs.input_json` + `node_executions` 重建 scope/state/条件分支边；已落定节点静默跳过 |
| M2 启动恢复 | 安全运行 `interrupted → queued` 自动续跑；风险运行保持 `interrupted` 并记录原因 |
| M3 重试与超时 | 节点级 `maxAttempts`、指数退避、可重试判定；非交互节点 `timeoutMs` |
| M4 观测与体验 | `run_started.resumed/resumeReason`、`node_started.attempt`、面板续跑与重试徽标 |
| M5 验证 | 定向单测与重启续跑集成；`pnpm check` 与 `pnpm verify:local` 全绿 |
| M6 收口 | 版本总结、发行说明、博客与发布 |

## 3. 关键设计

### 3.1 用已有表重建执行现场

```text
workflow_runs.input_json        → start 节点 params
node_executions(status,outputs) → state + scope
condition 的 outputs.result     → liveEdges
```

`loadCheckpoint` 只收 `succeeded / skipped`；同一节点多行时取最后一行。引擎初始化时预置作用域与状态，已落定节点在两个调度路径上都静默跳过，不补发事件。

### 3.2 恢复安全矩阵

| 场景 | 决策 | 原因码 |
|---|---|---|
| `waiting_human` | 续跑并重新进入等待 | `waiting_human` |
| 在途节点为安全类型 | 续跑并重执行该节点 | `safe_in_flight` |
| 在途节点为 human / agent / 写危险 tool | 保持 `interrupted` | `unsafe_in_flight` |
| 运行版本变化或编译失败 | 保持 `interrupted` | `version_missing` |
| `trigger=chat` | 保持 `interrupted` | `chat_request_gone` |
| 无节点进度 | 续跑（等价从头执行） | `empty_checkpoint` |

安全类型：`llm`、`knowledgeSearch`、`condition`、只读 `tool`、`end`、`start`。

### 3.3 重试与退避

节点 `config` 可选：

```json
{ "retry": { "maxAttempts": 3, "backoffMs": 1000, "maxBackoffMs": 30000 }, "timeoutMs": 60000 }
```

- 仅对执行体抛出的错误重试；引用解析、参数校验、权限拒绝与资源缺失不重试；
- 退避 `min(backoffMs × 2^(attempt-1), maxBackoffMs)`，无抖动，保证可复现；
- 每次重试复用 `node_started` 事件并携带 `attempt`，不新增事件类型。

### 3.4 超时边界

- 生效：`llm`、`knowledgeSearch`、只读 `tool`、`end`；
- 忽略：`human`、写/危险 `tool`、`agent`、`start`；
- 超时按节点失败收敛，消息含「超时」与毫秒数；底层执行体不强制中断，但结果被忽略。

### 3.5 幂等与副作用

| 节点状态 | 续跑行为 |
|---|---|
| `succeeded` | 复用落库输出，不执行 |
| `skipped` | 维持跳过 |
| `running` 安全节点 | 允许重执行（至少一次语义） |
| `running` 风险节点 | 不自动续跑，交给人工重放 |

写/危险工具不自动重放是硬约束：宁可让用户确认一次，也不重复副作用。

## 4. 验收不变量

1. 已成功节点在续跑中不执行，副作用只发生一次；
2. `waiting_human` 运行重启后续跑并重新进入等待；
3. 风险在途运行保持 `interrupted`，原因可查；
4. `maxAttempts=3` 且持续失败时恰好执行 3 次；
5. 超时节点按失败收敛且消息可读；
6. 未配置策略、无中断时事件序列与 v4.22 完全一致；
7. `pnpm check`、`pnpm verify:local` 与定向测试全绿。

## 5. 迁移与兼容

- 零数据库迁移：checkpoint 完全来自现有表；
- 备份格式与 `LATEST_SCHEMA_VERSION` 不变；
- 不新增事件类型；旧读取方忽略 `resumed / resumeReason / attempt` 即可；
- 回退代码后，续跑逻辑消失，残留 `queued` 运行按旧队列逻辑执行。

## 6. 验证结果

- 定向单测：checkpoint 重建 2 条、恢复矩阵 7 条、续跑 3 条、重试/超时 4 条；
- 运行服务集成：空检查点续跑、写工具在途保持中断、已成功节点不重复执行；
- 全量流程测试 134 条通过；
- `pnpm check` 与 `pnpm verify:local` 全绿。

## 7. 后续方向

- 定时 / webhook / 文件监听触发（「会守时」）；
- 失败节点批量重放与补偿队列；
- 跨版本运行迁移；
- 沙箱代码执行与浏览器自动化（「会动手」）。
