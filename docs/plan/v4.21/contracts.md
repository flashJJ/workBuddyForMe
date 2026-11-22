# v4.21 契约冻结（M0）

> 状态：已冻结（2026-11-22）
> 上游：[spec.md](./spec.md) · [tasks.md](./tasks.md) · [选题](./README.md)
> 原则：零迁移；解释与导出不泄露正文；每项可独立验收

## 1. 统一召回入口

```ts
export type MemoryRecallScene = 'chat' | 'task' | 'intent-forget';

export interface MemoryRecallBudget {
  maxItems: number;
  /** 字符近似：1 token ≈ 2 字符，向上取整 */
  maxTokens: number;
}

export interface MemoryRecallRequest {
  query: string;
  scene?: MemoryRecallScene; // 默认 chat
  budget?: Partial<MemoryRecallBudget>; // 覆盖场景预设
  assistantId?: string | null;
  conversationId?: string | null;
  signal?: AbortSignal;
  traceParent?: TraceHandle | null;
}

recall(request: MemoryRecallRequest): Promise<RecalledMemory[]>
```

- 旧的 `recall(query, options)` 位置参数在 M1 内部改为请求对象，调用方同步迁移；
- 返回仍为 `RecalledMemory[]`，不改变提示词装配；
- 空 query 直接返回 `[]`，不写召回统计；
- 召回失败不阻塞对话（沿用现有 `safeRecallEvent` 告警策略）。

## 2. 场景与预算

| 场景 | maxItems | maxTokens | 用途 |
|---|---|---|---|
| `chat` | 3 | 600 | 回合前召回（默认） |
| `task` | 3 | 600 | 任务上下文召回 |
| `intent-forget` | 5 | 750 | 「忘掉…」定位目标，不注入 |

- 通道：语义、关键词、重要度、新鲜度、关系邻居、置顶；
- 权重沿用现有常量：语义 0.55 / 关键词 0.20 / 重要度 0.15 / 新鲜度 0.10；无嵌入时语义权重并入关键词（0.75 / 0.15 / 0.10）；
- 候选池：向量与 FTS 各取 20 条；邻居种子 2、邻居上限 2；置顶上限 3；
- 置顶条目不受 token 预算裁剪，但受 `maxItems` 与置顶上限约束；
- 预算裁剪按融合分升序丢弃，同分按 id 升序稳定排序。

## 3. 冲突裁决

- 候选集：同一 `subjectKey` + 同一精确作用域 + `status='active'` + 未过期；
- 无 `subjectKey` 的记忆不参与冲突合并，按普通候选参与预算裁剪；
- 裁决顺序：

```text
用户固定 > 新鲜度（lastConfirmedAt ?? createdAt，降序）
        > 置信度（confidence，降序）
        > 稳定顺序（version 降序，再 id 降序）
```

- 每个主体只注入 1 条；落选值保留在库中，可查询但不注入；
- 裁决理由枚举：`pinned` / `fresher` / `higher-confidence` / `stable-order`；
- 现有的召回理由（`semantic/keyword/hybrid/pinned/neighbor`）保留，裁决理由单独放在解释结构里。

## 4. 用户治理动作

| 动作 | 语义 | 审计 action | 幂等 |
|---|---|---|---|
| 固定 | `pinned=true` | `pin` | 已固定则不写 |
| 取消固定 | `pinned=false` | `unpin` | 未固定则不写；`constraint` 拒绝 |
| 降权 | `importance=max(0, i-0.1)` | `downweight` | 目标值不变则不写 |
| 升权 | `importance=min(1, i+0.1)` | `upweight` | 目标值不变则不写 |
| 合并 | 保留目标，归档来源 | `merge` | 已归档来源不重复计数 |
| 删除 | `status='archived'` | `archive` | 已归档则不写 |

- 所有动作 `actor='user'`，before/after 快照写入现有 `memory_events`；
- 合并审计的 after 快照包含 `mergedFrom: string[]`，不复制正文；
- 撤销沿用归档语义：`unpin` / `restore` 回到上一状态，不做物理删除；
- 治理动作走现有 `PATCH /api/memories/[id]` 扩展字段，不新增数据库列。

## 5. 解释轨迹

```ts
export interface MemoryRecallTrace {
  scene: MemoryRecallScene;
  at: string;
  queryLength: number;
  durationMs: number;
  candidates: number;
  selected: number;
  dropped: { byScore: number; byBudget: number; byConflict: number };
  channels: Record<'semantic' | 'lexical' | 'pinned' | 'neighbor', number>;
  resolutions: Array<{ memoryId: string; reason: ConflictReason }>;
}
```

- 轨迹只保存在进程内环形缓冲，最近 5 次召回，不落库、不上报；
- 只读接口 `GET /api/memories/explain?limit=5`，返回上述结构；
- 字段白名单：不含 query 正文、记忆正文、来源会话/消息 id、绝对路径；
- 设置页「最近召回」只展示白名单字段。

## 6. 记忆导出

- 入口：设置页记忆面板「导出」，格式 Markdown / JSON；文件名 `memories-<YYYYMMDD>.md|json`；
- 字段：`kind / content / scope / importance / status / pinned / confidence / subjectKey / createdAt / lastConfirmedAt`；
- 不含：来源会话与消息 id、审计细则、向量、嵌入模型信息、本机路径；
- 导出为用户主动动作，包含正文；不做后台自动导出。

## 7. 统计口径

- `pinnedActive`：当前 `status='active' AND pinned=1` 条数；
- `mergedTotal` / `downweightedTotal`：`memory_events` 中 `action='merge' | 'downweight'` 的在线条数 + 已轮转聚合计数；
- 不新增统计字段存储；轮转后仍可从 `memory_event_rollups` 复算。

## 8. 迁移与依赖

- **零数据库迁移**：`pinned / importance / confidence / subject_key / version / valid_from / valid_to` 均已存在；
- 治理动作复用 `MemoryUpdateFields` 与现有审计表；
- 不新增运行时依赖；不更换嵌入模型，不重建向量索引；
- 若实现中发现必须迁移，必须提供回滚脚本、备份校验与升级说明，并在本文件补充记录。

## 9. 验收不变量

1. `chat` / `task` 场景在 golden 集上的召回集合与顺序与 v4.20 等价（M1）；
2. 同一 `subjectKey` 每轮最多注入 1 条，裁决理由与顺序表一致；
3. 置顶条目不会被 token 预算裁掉；
4. 治理动作幂等：重复操作不新增审计；
5. 解释轨迹与导出不含正文以外的隐私字段；
6. 关闭解释开关（若实现）或接口失败不影响召回；
7. `pnpm check`、`pnpm verify:local` 与定向 E2E 全绿。
