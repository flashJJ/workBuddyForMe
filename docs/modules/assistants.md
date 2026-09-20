# 模块设计：助手预设

> 状态：已实现（Task 13/20/26/33）

## 职责

- 助手 CRUD、排序、emoji/颜色标识。
- 系统提示词与采样参数（temperature/topP/maxTokens）预设。
- 绑定对话模型与可选知识库（绑定即走 RAG）。
- 内置默认助手（种子数据，禁删）。

## 关键实现（core）

`packages/core/src/services/assistant-service.ts`：

- `list() / get(id) / create(input) / update(id, input) / remove(id) / reorder(orderedIds)`
- 创建/更新时校验 `modelId` 与 `knowledgeBaseId` 分别存在于 model/knowledge_base 表，否则抛 `validation` 错误。
- 删除内置助手抛 `FORBIDDEN`（HTTP 403，`内置助手不可删除`）。
- `reorder` 要求 `orderedIds` 与现有助手集合完全一致，逐个更新 `sortOrder`。

## 数据

`assistants` 表（见架构文档 ER）；`is_builtin=1` 为内置默认助手（首次启动迁移种子写入）。

## 与对话的关系

发起对话时以助手当前参数组装请求（系统提示词、采样参数、模型）；助手后续编辑不影响历史消息（消息不回写提示词）。`temperature` 等 schema 级范围校验见 `packages/shared/src/schemas`。

## 前端

`apps/web/src/app/assistants/`：助手卡片网格（`assistant-grid`）+ 新建/编辑对话框 + 拖拽/按钮排序，调用 `/api/assistants` 与 `/api/assistants/reorder`。
