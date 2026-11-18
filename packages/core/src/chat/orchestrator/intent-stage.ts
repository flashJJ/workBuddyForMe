import type { Assistant, MemoryNotice } from '@wbfm/shared/types';
import type { TurnIntent } from '@wbfm/shared/schemas';
import { INTENT_CLASSIFIER_TIMEOUT_MS } from '@wbfm/shared/constants';
import type { ServiceDeps } from '../../services/base/deps';
import type { MemoryService } from '../../memory/memory-service';
import { classifyTurnIntent } from '../context/turn-intent';
import { createIntentClassifier } from '../context/intent-classifier';
import { applyMemoryIntent } from '../../memory/intent-memory';

/**
 * v4.8 回合意图阶段：识别意图 → 落 turn_intent 事件 → 执行显式记忆命令。
 * 放在检索与装配之前，保证「忘掉」先于召回、「记住」本轮即可被引用。
 */

export interface IntentStageParams {
  deps: ServiceDeps;
  assistant: Assistant;
  memory: MemoryService;
  conversationId: string;
  sourceMessageId: string;
  userContent: string;
  hasImages: boolean;
  /** 重新生成时只识别意图，不重复执行记住/忘掉 */
  applyMemory?: boolean;
  signal?: AbortSignal;
}

export interface IntentStageResult {
  intent: TurnIntent;
  notices: MemoryNotice[];
}

export async function runIntentStage(params: IntentStageParams): Promise<IntentStageResult> {
  const intent = await classifyTurnIntent(
    {
      text: params.userContent,
      hasImages: params.hasImages,
      knowledgeBound: params.assistant.knowledgeBaseIds.length > 0,
    },
    createIntentClassifier(params.deps),
    INTENT_CLASSIFIER_TIMEOUT_MS,
  );
  params.deps.events?.recordChat(params.conversationId, 'turn_intent', intent);
  const notices =
    params.assistant.memoryEnabled && params.applyMemory !== false
      ? await applyMemoryIntent({
        memory: params.memory,
        assistantId: params.assistant.id,
        conversationId: params.conversationId,
        sourceMessageId: params.sourceMessageId,
        text: params.userContent,
        signal: params.signal,
      })
    : [];
  return { intent, notices };
}
