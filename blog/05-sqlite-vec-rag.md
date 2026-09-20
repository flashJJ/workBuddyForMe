# SQLite + sqlite-vec：100 篇文档内的私域知识库怎么做

> 不上向量数据库，也能玩 RAG。

## 为什么不上 Milvus / Pinecone

做个本地私人 AI 助手，知识库撑死几百篇文档、几万条分片。为这点数据部署一个向量数据库？太重了，还多一个运维负担。

我的选择：**SQLite + sqlite-vec**。一个文件搞定结构化数据和向量检索，零部署、易备份。

## sqlite-vec 是什么

sqlite-vec 是 SQLite 的一个扩展，提供 `vec0` 虚拟表存储浮点向量，支持 L2 距离检索。安装后，你可以在 SQLite 里这样建表：

```sql
CREATE VIRTUAL TABLE chunks_vec USING vec0(
  rowid INTEGER PRIMARY KEY,
  embedding FLOAT[1536]
);
```

`rowid` 关联到分片表的主键，`embedding` 存向量。查询时：

```sql
SELECT rowid, distance
FROM chunks_vec
WHERE embedding MATCH ? AND k = 4
ORDER BY distance;
```

返回距离最近的 4 个分片。

## 数据模型

```text
knowledge_bases 1──* documents 1──* document_chunks 1──1 chunks_vec
```

- `knowledge_bases`：知识库（可配置分片大小/重叠）
- `documents`：文档（文件名、状态、chunk_count）
- `document_chunks`：分片（内容、序号、字符范围）
- `chunks_vec`：向量（rowid = chunk_id，embedding float[dim]）

删除知识库 → 级联删文档 → 级联删分片 → 级联删向量。一条外键链搞定。

## 摄入流水线

文档上传后，后台跑一条流水线：

```text
pending → processing → indexed
                 └──→ failed
```

步骤：
1. **解析文本**：txt/md 直读，pdf 用本地 JS 库提取
2. **分片**：按知识库配置的 `chunk_size`（默认 500 字符）和 `overlap`（默认 80）切分，优先段落边界
3. **Embedding**：调用配置的 Embedding 模型，批量向量化
4. **写库**：删旧分片/向量 → 批量插分片 → 插向量 → 状态置 indexed

任一步失败，文档状态置 `failed` 并记录错误信息（比如「未配置 Embedding 模型」）。

## 一个坑：sqlite-vec 0.1 只支持 L2

sqlite-vec 0.1.x 版本只提供 L2（欧氏距离）检索，不直接支持余弦相似度。但 Embedding 模型通常期望余弦相似度。

解法：**检索前对查询向量和库存向量都做 L2 归一化**。归一化后，L2 距离和余弦相似度是单调等价的——L2 距离最小的，余弦相似度最大。

```ts
function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? vec : vec.map((x) => x / norm);
}
```

库存向量入库前归一化，查询向量检索前归一化。这样 sqlite-vec 的 L2 检索就等价于余弦相似度检索。

## 检索与引用组装

用户提问时：

1. 把问题 Embedding 成向量
2. 在对应知识库的 `chunks_vec` 里查 top-k（默认 4）
3. 用 chunk_id 关联出分片内容
4. 组装成上下文块，连同 citations（文档名、序号）一起喂给对话模型

```text
【参考资料】
[1] 文档A.md 第2段：...
[2] 文档B.pdf 第1段：...

请优先参考以下检索到的资料回答...
```

模型回答后，citations 随消息一起存库，前端在回答里渲染引用角标。

## 维度一致性的坑

同一个向量表，维度必须一致。如果你切换了 Embedding 模型（比如从 1536 维换到 1024 维），旧向量用不了。

我的处理：维度跟随默认 Embedding 模型，切换模型时提示用户重建索引。不做自动迁移——100 篇文档量，重建也就几秒的事，简单比聪明重要。

## 性能够不够

实测：几万条分片，top-4 检索 P95 < 300ms。对于本地单用户应用，完全够用。SQLite 的并发写用 WAL 模式 + busy_timeout，也扛得住。

## 小结

小体量知识库，别上重型向量数据库：

1. **SQLite + sqlite-vec** 一个文件搞定，零部署
2. **L2 归一化** 等价余弦相似度，绕开 sqlite-vec 的限制
3. **摄入流水线状态机**，失败可追溯，幂等重摄可自愈
4. **外键级联**，删除知识库自动清理分片和向量

下一篇聊聊「SSE 流式对话是怎么炼成的」——从上游 chunk 到前端渲染的全链路。
