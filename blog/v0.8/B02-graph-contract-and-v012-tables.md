# 一张图存哪里、怎么版本化：zod 图契约与四张表的快照设计

可视化工作流编辑器的第一行代码不是画布，是**契约**：节点长什么样、边允许怎么连、配置值的结构是什么。契约错了，编译器、引擎、编辑器、API 四层各写各的理解，后面全是补丁。这篇讲我们在本地优先的桌面 AI 应用里，如何用一份 zod schema 同时约束前后端与数据库，以及四张表怎样支撑「保存即快照、发布即固定」。

## 一切从「图是什么」开始

图的定义放在 shared 包，用 zod 写一份 schema，前后端和数据库序列化共用同一份事实源：

```ts
// shared 包的 flow schema（简化）
export const flowNodeSchema = z.object({
  id: z.string().regex(FLOW_NODE_ID_PATTERN, '节点 id 仅允许字母数字_-'),
  type: z.enum(['start', 'llm', 'knowledgeSearch', 'tool', 'condition', 'human', 'end']),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const flowEdgeSchema = z.object({
  id: z.string().trim().min(1),
  source: z.string().trim().min(1),
  target: z.string().trim().min(1),
  sourceHandle: z.enum(['true', 'false']).optional(), // 只有 condition 能用
});

export const flowGraphSchema = z.object({
  nodes: z.array(flowNodeSchema).min(2).max(FLOW_MAX_NODES),
  edges: z.array(flowEdgeSchema).max(FLOW_MAX_EDGES),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() }).optional(),
});
```

注意几个刻意的选择：

**config 故意是开放的 `Record<string, unknown>`，不是七选一的判别联合。** 节点配置的语义校验分散在两类地方：结构层面（入参字段是数组、condition 的 op 合法）由各自的细化 schema（如 `flowStartConfigSchema`）在需要的地方 parse；跨节点语义（这个节点的引用指向谁、库里有没有这个知识库）由编译器和运行时负责。如果在入口用一个超大判别联合把 7 种 config 焊死，每加一种节点属性都要动 shared 契约，编辑器里的草稿态（用户正在填一半的非法值）也会直接无法序列化——开放 config 让「编辑中的脏状态」可以合法保存，校验结果以诊断形式返回而不是抛异常。

**节点 id 有正则但不强制语义。** id 是 `llm_abc123` 这样前端生成的随机串，不依赖自增主键，所以一张图在 JSON 层面就是完整的——节点可以安全地引用另一个节点的 id 而不需要数据库给号。这对后面的引用语法和离线复制都至关重要。

---

## 四张表：一次建表迁移，只做加法

这个项目的数据库迁移有一条铁律：迁移只走 `PRAGMA user_version` 顺序文件，**只 ADD 不 ALTER 既有表**。工作流功能的建表迁移一次加了四张表：

```sql
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'workflow',
  color TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'draft',      -- draft | published | disabled
  current_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE workflow_versions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id),
  version INTEGER NOT NULL,
  graph_json TEXT NOT NULL,                  -- 完整 FlowGraph 序列化
  published_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(workflow_id, version)
);

CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id),
  version INTEGER NOT NULL,                  -- 运行时钉住的版本
  trigger TEXT NOT NULL,                     -- manual | chat（api/mcp/schedule 留给后续版本）
  status TEXT NOT NULL,                      -- queued|running|waiting_human|succeeded|failed|cancelled
  input_json TEXT, output_json TEXT, error_json TEXT,
  conversation_id TEXT,
  started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL
);

CREATE TABLE node_executions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  node_id TEXT NOT NULL,
  status TEXT NOT NULL,                     -- running|succeeded|failed|skipped|waiting_human
  inputs_json TEXT, outputs_json TEXT, error TEXT,
  started_at TEXT, finished_at TEXT, duration_ms INTEGER NOT NULL DEFAULT 0
);
```

为什么 run 和 node_executions 要分两张表而不是一张大表塞 JSON？因为**逐节点状态更新是高频写，且要按节点 upsert**。引擎每个节点开始/结束各写一次，一张长表 + `(run_id, node_id)` 唯一索引让「更新某节点状态」就是一条 `INSERT ... ON CONFLICT DO UPDATE`，天然事务、天然可查时间线；run 表只存终态级字段，列表查询不用扫节点明细。

`workflow_runs.version` 这个字段是故意冗余存的：**运行必须钉住创建那一刻的图版本**。即使运行期间作者又保存了 v3，v2 发起的 run 仍然按 v2 跑完——否则长流程执行到一半图变了，引用全部对不上。

迁移测试的方式也延续传统：在测试里对上一个版本的真实库文件跑迁移，断言表数量、旧表行数、旧数据一字未动。

---

## 版本化：保存是快照，发布是固定别名

仓储层两个操作值得单独说。

**保存永远产生新版本，从不在原版本上覆盖：**

```ts
addVersion(workflowId, graph) {
  const save = db.transaction(() => {
    const version = max(version) + 1;
    INSERT INTO workflow_versions ...;
    // 关键：在已发布版本上继续存图，状态回到 draft
    UPDATE workflows SET current_version = version, status = 'draft' ...;
  });
}
```

这意味着「已发布」不是一个布尔开关，而是一根**指向不可变快照的指针**：

- v1 发布 → 对话工具调 v1；
- 作者保存了 v2 但没发布 → 状态变 draft，对话仍然调 v1（发布固定的是 v1 那一行的 published_at）；
- 再发布 v2 → 指针移到 v2。

线上行为和草稿编辑因此彻底隔离。「我改了一下流程图试试，结果线上对话行为变了」这种事故在数据模型层面就不可能发生。

**发布只置 published_at + status，不复制图：**

```ts
publishVersion(workflowId, version?) {
  // 校验版本存在 → 写 published_at → status='published'
}
```

工具解析器（引擎阶段已做、集成阶段打通对话）只认一件事：`status === 'published'` 时取 `current_version` 的图构建 Tool。取消发布就是把状态置为 disabled，`resolveTool` 返回 null，工具目录里立刻消失——全程不需要删任何版本数据。

---

## 一份 schema 同时服务四个消费者

这份契约最省事的地方是复用面：

| 消费者 | 怎么用 schema |
|---|---|
| POST /api/flows/:id/versions | `flowGraphSchema.parse(body)` 做入口结构校验，非法直接 422 |
| POST /validate | 结构 parse 通过后再跑编译器做跨节点语义校验，返回带定位的诊断数组 |
| 前端编辑器 | zod infer 出 `FlowGraph/FlowNode/FlowEdge` 类型，与 React Flow 的元素结构互转（fromDomain/toDomain 两个纯函数） |
| start 节点 | `flowStartConfigSchema.safeParse(config)` 取入参声明，`buildFlowInputJsonSchema` 直接生成发布工具的 OpenAI parameters |

最后这个复用特别值：流程作者在 start 节点声明的入参（名/类型/必填/默认/说明），**发布后自动变成对话里模型看到的 function-calling 参数 schema**：

```ts
export function buildFlowInputJsonSchema(fields: FlowInputField[]) {
  return {
    type: 'object',
    properties: Object.fromEntries(fields.map((f) => [f.name, fieldSchema(f)])),
    required: fields.filter((f) => f.required !== false).map((f) => f.name),
    additionalProperties: false,
  };
}
```

「画布上的入参定义」和「工具接口契约」是同一份数据，不需要作者写第二遍，也不会不一致。

---

## 小结：数据模型层的三条经验

1. **入口 schema 管结构，编译器管语义。** 试图用一份 zod 校验所有跨节点规则，只会得到一份没人敢改的巨型联合类型。开放 config + 分层校验，编辑中的脏状态才有容身之处。
2. **可变工作流 + 不可变版本 + 发布指针。** 这是函数部署和内容发布系统共同验证过的模型，比「published 布尔位 + 原地改图」多一张版本表，省掉一整类线上事故。
3. **迁移只做加法，运行钉住版本。** 旧版库零回填升级；run 行冗余存 version，让「图在变、运行不变」成为默认语义。

下一篇进入 core：拿到一张结构合法的图之后，编译器如何判断它到底能不能跑——环、孤岛、死路、没连全的分支，以及怎么让每个错误都能在画布上被点出来。
