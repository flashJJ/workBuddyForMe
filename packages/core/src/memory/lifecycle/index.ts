/** @子域 barrel memory/lifecycle：实时约束、写入决策、混合召回打分与库编排 */
export { extractRealtimeConstraints } from './memory-constraint';
export { decideWrite, type MemoryWriteAction, type MemoryWriteDecision } from './memory-write';
export {
  fuseMemoryScore,
  normalizeFtsRank,
  recallReason,
  recencyScore,
  resolveRecallWeights,
  type RecallWeights,
  type ScoredMemoryInput,
} from './memory-retriever';
export {
  createMemoryPersister,
  type MemoryPersister,
  type PersistContext,
  type PersistResult,
} from './memory-persist';
export {
  createMemoryRecall,
  type MemoryRecall,
  type RecallCollectInput,
} from './memory-recall';
