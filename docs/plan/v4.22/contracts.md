# v4.22 契约冻结（M0）

> 状态：已冻结（2026-11-23）
> 上游：[spec.md](./spec.md) · [tasks.md](./tasks.md) · [选题](./README.md)
> 原则：零迁移；默认关闭；`parallelism=1` 与 v4.21 逐字等价；不新增事件类型

## 1. Controller Pipeline 接口

```ts
// packages/core/src/context/pipeline/types.ts

export type ContextSourceId =
  | 'conversation-summary'
  | 'conversation-facts'
  | 'active-plan'
  | 'recent-messages'
  | 'long-term-memory';

export interface ContextFragment {
  /** 片段唯一键：同 key 只保留最高优先级来源的一条 */
  key: string;
  source: ContextSourceId;
  /** 数值越小优先级越高；同优先级按采集顺序稳定排列 */
  priority: number;
  /** 片段正文（已含标题与分隔前的纯文本） */
  text: string;
  /** 片段之间的分隔符，缺省为双换行 */
  separator?: string;
}

export interface ContextCollectRequest {
  conversationId: string | null;
  goal: string;
  assistantId?: string | null;
  contextWindow?: number | null;
  budgetTokens?: number;
  signal?: AbortSignal;
}

export interface ContextSource {
  id: ContextSourceId;
  priority: number;
  enabled?: (request: ContextCollectRequest) => boolean;
  collect(request: ContextCollectRequest): Promise<ContextFragment[]> | ContextFragment[];
}

export interface ContextSourceStatus {
  id: ContextSourceId;
  status: 'ok' | 'empty' | 'skipped' | 'failed';
  fragments: number;
  durationMs: number;
}

export interface ContextCollectResult {
  fragments: ContextFragment[];
  sources: ContextSourceStatus[];
}

collectContext(
  sources: ContextSource[],
  request: ContextCollectRequest,
): Promise<ContextCollectResult>
```

- 采集并发执行；单来源抛错只记 `status='failed'`，不影响其他来源；
- `enabled` 返回 false 记 `skipped`，不调用 `collect`；
- 返回片段保持来源优先级 + 来源内顺序，Collector 不做预算裁剪。

```ts
export interface ContextPackResult {
  text: string | null;
  fragments: number;
  dropped: number;
  truncated: boolean;
}

packContext(
  fragments: ContextFragment[],
  options: { budgetTokens: number; separator?: string },
): ContextPackResult
```

- 排序：`priority` 升序，同优先级按输入顺序；
- 去重：同 `key` 保留排在前面的片段；
- 裁剪：拼接后超预算时从尾部（最低优先级）整段丢弃；仅剩一段仍超预算时按 `truncateToTokens` 截断该段；
- 无片段返回 `{ text: null, ... }`。

## 2. 任务上下文等价契约

| 顺序 | 来源 | 标题 | v4.21 对应 |
|---|---|---|---|
| 1 | conversation-summary | `【会话摘要】` | 现第 1 段 |
| 2 | conversation-facts | `【已知事实】` | 现第 2 段（含计划检查点） |
| 3 | active-plan | `【当前计划】` | 现第 3 段 |
| 4 | recent-messages | `【近期对话】` | 现第 4 段 |
| 5 | long-term-memory | `【相关长期记忆】` | 现第 5 段 |

- 拼接分隔符统一为 `\n\n`；
- 空片段不产出，空结果返回 `null`；
- 预算沿用 `resolveTaskContextBudget(contextWindow)`；
- 单测断言：固定夹具下输出字符串与 v4.21 快照完全相等。

## 3. Flow 图字段

```ts
// packages/shared/src/schemas/flow/flow.ts
export const flowGraphSchema = z.object({
  nodes: ...,
  edges: ...,
  viewport: ...,
  /** v4.22：并行度；缺省 1 = 串行（与旧图等价） */
  parallelism: z.number().int().min(1).max(4).optional(),
});
```

- 读旧图（无字段）按 1 处理；
- 不改变节点 / 边 / 编译诊断规则；
- 非 end 节点单入边限制不变。

## 4. 引擎调度契约

```ts
export interface RunFlowOptions {
  // ...既有字段
  /** v4.22：本次运行的并发上限；缺省取 compiled.graph.parallelism ?? 1 */
  maxConcurrency?: number;
}
```

- `maxConcurrency` 取 `clamp(options.maxConcurrency ?? graph.parallelism ?? 1, 1, 4)`；
- 就绪定义：节点未开始，且所有前驱状态 ∈ `{succeeded, skipped, failed}`；
- 可并行类型：`llm`、`knowledge_search`、`condition`、`tool`（`permission === 'read'`）、`end`；
- 串行类型：`human`、`tool`（write / danger）、`agent`、`start`；
- 执行中节点数 ≤ `maxConcurrency`；
- `maxConcurrency === 1` 走原串行代码路径（事件序列必须与 v4.21 完全一致）。

## 5. 并行语义

| 语义 | 契约 |
|---|---|
| 预算共享 | 全运行共享 `createToolTurnBudget`；超限分支返回 `ok:false`，不抛错 |
| 幂等键 | `${runId}:${nodeId}`；同运行内节点最多执行一次，重复调度复用已落作用域的输出 |
| 失败隔离 | 并发 > 1：失败节点标 failed；其未执行后代标 skipped（reason 含「上游失败」）；无关分支继续；运行终态 `run_failed` 汇总首个失败 |
| 快速失败 | 并发 = 1：保持现行「首个失败即 run_failed 并停止」 |
| 结果收敛 | 多个成功 end：按 `compiled.order` 更靠前者作为运行输出，其余仅事件可见 |
| 取消 | `signal.aborted` 时停止启动新节点，等待执行中节点结束后发 `run_cancelled` |

## 6. 事件契约

| 事件 | 变更 |
|---|---|
| `run_started` | 新增可选 `parallelism: number`（实际生效值） |
| `node_started` | 不变 |
| `node_succeeded` | 不变（`durationMs` 为节点自身耗时） |
| `node_skipped` | 新增 reason 文案「上游失败」用于失败隔离 |
| `node_failed` / `run_failed` / `run_succeeded` / `run_cancelled` | 不变 |

- 不新增事件类型；旧读取方忽略 `parallelism` 即可；
- 并发 > 1 时完成事件按实际完成顺序发出，不做排序缓冲。

## 7. 迁移与依赖

- **零数据库迁移**：`parallelism` 仅存在于图 JSON；
- 备份格式、`LATEST_SCHEMA_VERSION` 不变；
- 不新增运行时依赖；
- 若实现中发现必须迁移，必须提供回滚脚本、备份校验与升级说明，并在本文件补充记录。

## 8. 验收不变量

1. 任务上下文输出与 v4.21 快照逐字一致；
2. 单来源失败不改变其他来源的片段与顺序；
3. `parallelism=1` 时事件序列与 v4.21 完全一致；
4. 扇出图在 `parallelism=2` 时两分支都执行，且执行中节点数 ≤ 2；
5. 同一 `${runId}:${nodeId}` 最多执行一次；
6. 失败隔离下无关分支仍完成，运行终态为 failed；
7. `pnpm check`、`pnpm verify:local` 与定向测试全绿。
