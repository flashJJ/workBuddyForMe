/**
 * 行 ↔ 领域对象映射聚合入口（v1.1 按领域拆分到 ./mapper/*，本文件仅 re-export 保面）。
 * 各仓储继续从 './mappers' 引用，消费方无感知。
 */
export { newId, nowIso } from './mapper/common';
export {
  mapProvider,
  mapModel,
  type ProviderRecord,
  type ProviderRow,
  type ModelRow,
} from './mapper/provider';
export { mapAssistant, type AssistantRow } from './mapper/assistant';
export {
  mapConversation,
  mapMessage,
  type ConversationRow,
  type MessageRow,
} from './mapper/conversation';
export {
  mapKnowledgeBase,
  mapDocument,
  type KnowledgeBaseRow,
  type DocumentRow,
} from './mapper/knowledge';
export { mapMemory, type MemoryRow } from './mapper/memory';
