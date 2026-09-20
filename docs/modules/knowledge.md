# 模块设计：知识库与 RAG

> 状态：已实现（Task 16/17/22/28/33）

## 职责

- 知识库 CRUD；文档上传（txt/md/markdown/pdf，≤10MB）与状态轮询。
- 导入流水线：解析 → 分片 → Embedding → 向量入库。
- 检索 top-k 与引用组装；删除级联（知识库→文档→分片→向量）。

## 状态机（DOCUMENT_STATUSES）

```text
pending ──▶ processing ──▶ indexed
                 │
                 └────────▶ failed（error_message 持久化，如未配置 Embedding 模型、上游接口失败）
```

## 关键实现（core）

- `packages/core/src/services/knowledge-service.ts`：`createKb / listKb / getKb / updateKb / removeKb`（级联删文档与分片）。
- `packages/core/src/services/document-service.ts`：`upload(kbId, {name, content})`（扩展名与大小校验，写入文件目录）、`list(kbId)`、`remove(docId)`、`getStatus(docId)`。
- `packages/core/src/ingestion/ingestion-pipeline.ts`：状态置 `processing` → 读取文档 → 按知识库 `chunkSize/chunkOverlap` 分片 → Embedding → 删除旧向量/分片 → 批量写 `chunks` 与 vec0 虚表 → 置 `indexed`；任一步失败置 `failed` 并持久化错误信息。
- `packages/core/src/retrieval/rag-retriever.ts`：`retrieve(queryText, assistant, signal)` → 无绑定知识库或无 Embedding 模型返回 `null`；否则检索 top-k，组装 `citations` 与注入上下文 `contextBlock`，空结果返回 `null`。

## 分片策略

默认 `DEFAULT_CHUNK_SIZE=500` 字符、`DEFAULT_CHUNK_OVERLAP=80`（知识库级可配，范围 100–4000）；优先段落边界切分，避免硬切断句。

## 向量存储与相似度

sqlite-vec `vec0` 虚表（`rowid=chunk_id`，`embedding float[dim]`），维度跟随 Embedding 模型（同库内要求维度一致，切换模型需重建索引）。sqlite-vec 0.1 仅支持 L2 距离，检索前对查询向量与库存向量做 L2 归一化，以等价余弦相似度排序；`DEFAULT_TOP_K=4`。

## 引用与安全

Citation 含文档名与分片序号等字段（见 `packages/shared/src/types/domain.ts`），前端在消息中渲染引用角标；删除文档/知识库在仓储层外键级联清理分片与向量（Task 7/8 验证）。
