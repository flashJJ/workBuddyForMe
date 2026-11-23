# 不上向量数据库：SQLite + sqlite-vec 做百篇文档级 RAG

本地优先的私人 AI 助手要做私域知识库，第一个抉择就是存储选型：要不要上 Milvus、Pinecone 这类向量数据库？先算数据量级——个人知识库撑死几百篇文档、几万条分片。为这点数据常驻一个向量服务，多一个进程要启动、多一套东西要备份，收益和成本完全不成比例。

这篇讲我们的轻量选择：**SQLite + sqlite-vec**。一个文件同时装下结构化数据和向量索引，零部署、易备份，性能在个人数据量级下反而绰绰有余。

## sqlite-vec 是什么

sqlite-vec 是 SQLite 的扩展，提供 `vec0` 虚拟表存储浮点向量，支持 L2 距离检索。装完扩展后可以直接在 SQLite 里建向量表：

```sql
CREATE VIRTUAL TABLE chunks_vec USING vec0(
  rowid INTEGER PRIMARY KEY,
  embedding FLOAT[1536]
);
```

`rowid` 关联到分片表主键，`embedding` 存向量。检索时：

```sql
SELECT rowid, distance
FROM chunks_vec
WHERE embedding MATCH ? AND k = 4
ORDER BY distance;
```

返回距离最近的 4 个分片，语义和专用向量库的 top-k 查询完全一致。

## 数据模型

```text
knowledge_bases 1──* documents 1──* document_chunks 1──1 chunks_vec
```

- `knowledge_bases`：知识库（可配置分片大小/重叠）；
- `documents`：文档（文件名、状态、chunk_count）；
- `document_chunks`：分片（内容、序号、字符范围）；
- `chunks_vec`：向量（rowid = chunk_id，embedding float[dim]）。

删除知识库 → 级联删文档 → 级联删分片 → 级联删向量，一条外键链走完，不需要在应用层手写清理逻辑。

## 摄入流水线

文档上传后，后台跑一条状态机流水线：

```text
pending → processing → indexed
                 └──→ failed
```

具体步骤：

1. **解析文本**：txt/md 直读，pdf 用本地 JS 库提取；
2. **分片**：按知识库配置的 `chunk_size`（默认 500 字符）和 `overlap`（默认 80）切分，优先落在段落边界；
3. **Embedding**：调用配置好的 Embedding 模型批量向量化；
4. **写库**：删旧分片/向量 → 批量插分片 → 插向量 → 状态置 indexed。

任一步失败，文档状态置 `failed` 并记录错误信息（比如「未配置 Embedding 模型」）。整个流程支持幂等重摄：重新上传或重试时先删旧数据再写，坏状态可以自愈。

## 一个真坑：sqlite-vec 0.1 只支持 L2

sqlite-vec 0.1.x 只提供 L2（欧氏距离）检索，不直接支持余弦相似度；而大多数 Embedding 模型的语义检索期望用余弦相似度。

解法：**检索前对查询向量和库存向量都做 L2 归一化**。归一化之后，L2 距离与余弦相似度单调等价——L2 距离最小的向量，余弦相似度恰好最大。

```ts
function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? vec : vec.map((x) => x / norm);
}
```

库存向量入库前归一化、查询向量检索前归一化，sqlite-vec 的 L2 检索在数学上就等价于余弦检索，不用换扩展。

## 检索与引用组装

用户提问时：

1. 把问题 Embedding 成向量；
2. 在对应知识库的 `chunks_vec` 里查 top-k（默认 4）；
3. 用 chunk_id 关联出分片原文；
4. 组装成上下文块，连同 citations（文档名、序号）一起喂给对话模型。

```text
【参考资料】
[1] 文档A.md 第2段：...
[2] 文档B.pdf 第1段：...

请优先参考以下检索到的资料回答...
```

模型回答后，citations 随消息一起存库，前端在回答里渲染引用角标。引用不是事后拼的装饰，而是在检索阶段就落定、可回溯到具体文档段落的证据链。

## 维度一致性的坑

同一张向量表里维度必须一致。如果切换 Embedding 模型（比如从 1536 维换到 1024 维），旧向量直接作废，混存会导致检索结果无意义。

这里的处理刻意保持简单：维度跟随当前 Embedding 模型，切换模型时提示用户重建索引，不做自动迁移。百篇文档量级重建索引也就几秒的事——**这种规模下，简单比聪明重要**，自动迁移的代码反而是长期负债。

## 性能够不够

实测：几万条分片，top-4 检索 P95 < 300ms。对本地单用户应用完全够用。SQLite 的并发写开 WAL 模式加 `busy_timeout` 兜底，个人使用强度下没有任何压力。

## 小结

小体量知识库，别急着上重型向量数据库：

1. **SQLite + sqlite-vec** 一个文件搞定结构化数据和向量，零部署；
2. **双向 L2 归一化** 让 L2 检索等价余弦相似度，绕开扩展限制；
3. **摄入流水线状态机**，失败可追溯，幂等重摄可自愈；
4. **外键级联**，删除知识库时分片和向量自动清理。

下一篇进入对话主链路：SSE 流式对话是怎么炼成的，从上游 chunk 一路讲到前端打字机渲染。
