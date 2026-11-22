/** @子域 barrel memory/lifecycle：实时约束、写入决策、混合召回打分与库编排 */
export { extractRealtimeConstraints } from './memory-constraint';
export { decideWrite, type MemoryWriteAction, type MemoryWriteDecision } from './memory-write';
export {
  MEMORY_RECALL_SCENES,
  MEMORY_RECALL_SCENE_PRESETS,
  applyRecallBudget,
  estimateMemoryTokens,
  fuseMemoryScore,
  normalizeFtsRank,
  recallReason,
  recencyScore,
  resolveMemoryConflicts,
  resolveRecallBudget,
  resolveRecallWeights,
  type ConflictCandidate,
  type ConflictResolveResult,
  type MemoryConflictReason,
  type MemoryConflictResolution,
  type RecallBudgetEntry,
  type RecallBudgetResult,
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
  type RecallCollectResult,
} from './memory-recall';
export { createMemoryStats, type MemoryStats } from './memory-stats';
export {
  readLastRollupAt,
  runMemoryEventRollup,
  type MemoryEventRollupOptions,
  type MemoryEventRollupResult,
} from './memory-event-rollup';
