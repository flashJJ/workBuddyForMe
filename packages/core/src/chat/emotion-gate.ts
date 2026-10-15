/**
 * v1.7：orchestrator 暴露给路由层的情绪门面（从 chat-orchestrator 抽出守行数门禁）。
 * - 读路径惰性衰减不落库；重置清除状态与流水；
 * - recordEventEmotion 仅用于剧情演出 played 后的联动（praise/comfort，source=event）。
 */
import type { EmotionService } from '../emotion';
import type { EmotionState } from '@wbfm/shared/schemas';
import type { EmotionEventRecord } from '@wbfm/database';

export interface OrchestratorEmotionGate {
  viewEmotion(assistantId: string): EmotionState;
  viewEmotionDetail(assistantId: string, eventLimit?: number): {
    state: EmotionState;
    events: EmotionEventRecord[];
  };
  resetEmotion(assistantId: string): EmotionState;
  recordEventEmotion(
    assistantId: string,
    input: { type: 'praise' | 'comfort'; description?: string },
  ): EmotionState;
  /** v2.0：每日关系地板检查点（scheduler 心跳驱动；进程内按日去重） */
  runRelationshipCheckpoint(now?: number): void;
}

export function createEmotionGate(emotion: EmotionService): OrchestratorEmotionGate {
  return {
    viewEmotion(assistantId) {
      return emotion.view(assistantId);
    },
    viewEmotionDetail(assistantId, eventLimit) {
      return emotion.viewWithEvents(assistantId, eventLimit);
    },
    resetEmotion(assistantId) {
      return emotion.reset(assistantId);
    },
    recordEventEmotion(assistantId, input) {
      return emotion.record(assistantId, {
        type: input.type,
        source: 'event',
        ...(input.description ? { description: input.description } : {}),
      });
    },
    runRelationshipCheckpoint(now) {
      emotion.runRelationshipCheckpoint(now);
    },
  };
}
