---
title: "记忆的独立向量管线：为什么不复用 chunks_vec，维度冲突怎么处理"
series: "WorkBuddy For Me v0.5 技术拆解"
number: "B06"
tags: ["workbuddy", "sqlite-vec", "embedding", "storage", "architecture"]
date: "2025-Q4"
---

## 问题：向量表能不能共用一张

v0.3 的知识库已经有了一套向量存储：document_chunks 主表 + chunks_vec 虚表（sqlite-vec）。v0.5 做记忆时需要同样的能力——记忆的语义召回本质也是「嵌入 → 最近邻检索」。

最省事的方案是直接复用：记忆也切片进 chunks_vec，召回时一起查。评审时被一个问题否掉了：**文档换嵌入模型要全量重建索引，记忆也要跟着陪葬吗？**

最终方案是独立管线：[memory-vector.ts](file:///e:/code/traeWork/workBuddyForMe/packages/database/src/memory-vector.ts) 维护 memories_vec 虚表，与 chunks_vec 同构但完全独立。这篇讲这个决策的三层理由，以及动态建表机制怎么解决「维度在迁移时不可知」的问题。

---

## 理由一：生命周期完全不同

文档和记忆虽然都是「文本 + 向量」，但它们的生命周期几乎没有交集：

| 维度 | 文档分片（chunks_vec） | 记忆（memories_vec） |
|---|---|---|
| 数量级 | 万级（一篇长文档几百片） | 千级（5 条/轮 × 使用频率） |
| 写入时机 | 用户显式导入文档 | 每轮对话后自动追加 |
| 换嵌入模型 | 全量重建（文档原文都在，重跑摄入管线） | 无法重建——记忆的「原文」就是记忆本身 |
| 清空语义 | 删知识库 | 用户隐私操作「清空记忆」 |
| 衰减 | 无（文档不会因时间失效） | 软归档（30 天 + 低重要性） |

最关键的一行是**换嵌入模型**。知识库重建索引是 v0.3 就支持的操作：chunks_vec 删掉重建，所有文档原文重跑嵌入。如果记忆和文档共用一张虚表，重建知识库时会发生什么？

- 方案 a：连记忆一起删——用户的记忆被一次知识库操作清空，隐私事故；
- 方案 b：重建时跳过记忆行——但维度变了，旧维度向量和新维度向量混在同一张维度钉死的表里，sqlite-vec 直接拒绝插入。

独立管线让两个域的重建、清空、维度变更互不感知。

## 理由二：维度在迁移时不可知

数据库迁移（v006）创建 memories 主表，但**没有创建 memories_vec**。原因写在迁移的注释里：

> memories_vec 不在迁移内创建，而在首次写入时按 embedding 维度动态创建——维度记录在 meta 表。

为什么？因为迁移运行时根本不知道嵌入向量的维度。qwen3-embedding:0.6b 是 1024 维，nomic-embed-text 是 768 维，OpenAI text-embedding-3-small 是 1536 维——维度取决于用户配置了哪个嵌入模型，而迁移是离线 schema 变更，不该也不需要在那时做假设。

动态建表机制（[ensureMemoryVectorTable](file:///e:/code/traeWork/workBuddyForMe/packages/database/src/memory-vector.ts)）：

```typescript
export function ensureMemoryVectorTable(db: DatabaseInstance, dimension: number): void {
  const existing = getMemoryVectorDimension(db);   // 从 meta 表读
  if (existing !== null) {
    if (existing !== dimension) {
      throw new Error(`记忆向量维度冲突：表为 ${existing}，当前模型为 ${dimension}`);
    }
    return;
  }
  const create = db.transaction(() => {
    db.exec(`CREATE VIRTUAL TABLE memories_vec USING vec0(embedding float[${dimension}])`);
    db.prepare(`INSERT INTO meta(key, value) VALUES(?, ?)`).run(
      'memory_vector_dimension', String(dimension));
  });
  create();
}
```

三个设计点：

**meta 表做维度登记处**。v0.5 给 meta 表加了 KV 通道（这也是它第一次承载运行期状态——之前的 user_version 是 schema 状态）。维度、衰减上次运行时间都住这里，不借道业务表。

**首次写入才建表**。没配嵌入模型的用户永远不会有一张空的 memories_vec——schema 极简主义。

**维度冲突直接抛错**。表是 1024 维、当前模型输出 768 维时，宁可报错也不静默写入。维度混乱的向量表是数据灾难——距离计算全错，召回结果全是噪声。抛错后用户在设置里换回原模型、或清空记忆库重建（维度登记随清空重置），两条路都是显式的。

## 理由三：检索 SQL 的域过滤内建

独立虚表让检索 SQL 的域归属一目了然（[searchMemoryVectors](file:///e:/code/traeWork/workBuddyForMe/packages/database/src/memory-vector.ts)）：

```sql
SELECT m.id AS memoryId, m.kind, m.content, m.importance, m.status, v.distance
FROM memories_vec v
JOIN memories m ON m.id = v.rowid
WHERE m.status = 'active' AND v.embedding MATCH json(@vec) AND k = @k
ORDER BY v.distance
```

**软归档过滤内建在检索里**：`m.status = 'active'` 让归档记忆自然退出召回，不需要应用层过滤。归档记忆恢复（面板操作）后立刻回到召回池，因为向量从来没删——软归档只动主表 status，不动向量。这也是「软归档而非物理删除」决策在存储层的红利：恢复是 O(1) 的状态翻转。

rowid 共用是另一个刻意设计：memories 主表用 `INTEGER PRIMARY KEY AUTOINCREMENT`，其 rowid 直接作为 memories_vec 的 rowid——主表行和向量行通过同一个整数关联，不需要额外的映射列。这和 document_chunks/chunks_vec 是同构模式，同一个项目里相同的存储模式复用相同的关联约定，读代码的人零学习成本。

---

## 代价：有意的代码重复

独立管线的代价是 [memory-vector.ts](file:///e:/code/traeWork/workBuddyForMe/packages/database/src/memory-vector.ts) 和知识库的 vector 模块有约 60% 的代码同构——建表、upsert、删除、检索，模式一样，表名和 meta key 不同。

这是**有意支付的重复**。抽公共模块（`createVecTable(tableName, metaKey)`）当然可行，但两个域未来演进方向不同：记忆侧可能加时间衰减加权检索，文档侧可能加文档级聚合过滤。现在抽出来的公共层，会在第一次差异化演进时变成阻碍。三条相似但独立演进的管线之前，复制比抽象便宜——这是 v0.5 对「重复 vs 抽象」的一次明确站队。

---

## 清空与一致性

用户点「清空记忆」（M4 面板，二次确认）时，`clearAll` 在单事务里删向量 + 删主表：

```typescript
const tx = deps.db.transaction(() => {
  deleteAllMemoryVectors(deps.db);
  return repo.deleteAll();
});
```

顺序无所谓（事务保证原子性），但必须同事务——任何一边单独成功都是幽灵数据：主表没了向量还在，召回永远查不到（JOIN 不上），但虚表体积还在涨；向量没了主表还在，记忆列表能看但永远召回不到。

备份轨（v0.4）同样不存向量——memories 主表行随 conversations/settings 之外的轨道导出，恢复后标记待重建嵌入。这与知识库「向量是可再生产物」的哲学一致，B06 不展开。

---

## 小结

独立向量管线的决策可以浓缩成一句话：**生命周期不同的数据，不要因为「看起来都是向量」就共用存储**。动态建表解决维度在迁移时不可知的问题，meta 表 KV 给运行期状态一个家，检索 SQL 内建 status 过滤让软归档零成本参与召回。

存储就绪，召回链路的最后一块拼图是阈值——下一篇 B07 讲 v0.5 最重要的实测故事：直觉阈值 0.78 全量零召回，golden set 怎么逼出 1.05 这个数。
