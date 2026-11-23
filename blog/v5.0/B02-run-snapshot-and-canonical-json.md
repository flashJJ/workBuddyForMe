# 运行开始时固化流程图：快照、canonical JSON 与版本回退

工作流引擎最容易踩的坑不是「图跑不起来」，而是「图变了之后，旧运行还在跑」。

运行记录里通常只有 `version`。执行时按这个版本去查图，看似没问题；但版本可能被删除、被覆盖，或者查询逻辑为了「方便」直接回退到当前生产版本。一旦发生，旧运行会按新图继续执行：节点 id 对不上、分支条件变了、输出结构也变了。

v5.0 的做法是：**运行创建时写一份流程图快照，续跑和重放优先使用快照**。

## 一、快照写什么

只写 FlowGraph 本身，不写节点执行记录：

```ts
const json = canonicalJsonStringify(graph);
const hash = sha256(json);
```

- `graph_snapshot_json`：canonical JSON；
- `graph_hash`：SHA-256，便于比较和排查；
- 写入时机：`createRun` 一次，之后不再更新。

节点执行记录仍在各自的表里，快照不会随运行时间增长。

## 二、为什么要 canonical JSON

同一张图，对象键顺序可能不同。直接 `JSON.stringify` 得到的字符串不稳定，哈希也就不能用来判断「图是否相同」。

canonical 规则很简单：

- 对象键升序；
- 数组保持原序；
- `undefined` 字段跳过；
- 递归处理嵌套对象。

这样同一份图在任何序列化路径下都得到同一字符串，哈希才可信。

## 三、加载顺序：快照 → 精确版本 → 明确失败

```ts
function loadRunGraph(run) {
  const snapshot = parseRunGraphSnapshot(runs.getGraphSnapshot(run.id));
  if (snapshot) return { graph: snapshot, version: run.version, source: 'snapshot' };

  const versionView = workflows.getVersion(run.workflowId, run.version);
  if (versionView) return { graph: versionView.graph, version: versionView.version, source: 'version' };

  throw conflict('原版本流程图已被删除，无法续跑 [flow/run-graph-unavailable]');
}
```

关键在最后一行：**不回退当前生产图**。宁可把运行收敛为 `interrupted` 并让用户选择「按新版本重放」，也不静默换图。

## 四、版本差异怎么算

运行详情需要告诉用户「这张图和现在差在哪」：

- 新增节点：当前图有、快照没有；
- 删除节点：快照有、当前图没有；
- 改类型节点：id 相同但 `type` 不同。

如果失败节点被删除或改类型，`canResumeFromFailedNode=false`，节点级重放会被拒绝。差异计算只读，不在列表页调用，避免列表接口变重。

## 五、重放为什么要走 `createRunFromGraph`

普通 `createRun` 会重新加载生产图；重放必须使用已经确定的图和版本。因此拆出一个内部入口：

```ts
createRunFromGraph({ graph, version, graphHash, parentRunId, resumedFromNode })
```

普通运行也走这个入口，只是图来自当前版本。这样只有一条写运行记录的路径，快照、哈希和批次 id 的写入不会分叉。

## 六、边界

- 快照只保证「图」不变，不保证外部工具、模型、知识库不变；
- 旧运行没有快照时，精确版本是唯一回退；
- 版本被删除时明确阻断，属于预期行为，不是缺陷；
- 快照随运行按保留策略清理，不会无限增长。
