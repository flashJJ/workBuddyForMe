import type { MemoryNotice } from '@wbfm/shared/types';
import type { MemoryService } from './memory-service';
import { extractMemoryCommand } from '../chat/context/turn-intent';

/**
 * v4.8 记忆治理：把「记住 / 忘掉」从抽取器旁路升级为显式意图。
 * - 记住：直接写助手作用域事实，重要度高于自动抽取；
 * - 忘掉：只归档不硬删（可恢复），逐条写审计事件；低相关/歧义时不动作。
 */

export interface MemoryIntentParams {
  memory: MemoryService;
  assistantId: string;
  conversationId: string;
  sourceMessageId: string;
  text: string;
  signal?: AbortSignal;
}

/** 忘掉时要求的最低召回分，避免「忘掉」误伤无关记忆 */
const FORGET_MIN_SCORE = 0.55;
/** 单次「忘掉」最多归档条数，防止一句话清空记忆 */
const FORGET_MAX_ITEMS = 3;

export async function applyMemoryIntent(params: MemoryIntentParams): Promise<MemoryNotice[]> {
  const command = extractMemoryCommand(params.text);
  if (!command) return [];
  if (command.action === 'remember') return remember(params, command.content);
  return forget(params, command.content);
}

async function remember(params: MemoryIntentParams, content: string): Promise<MemoryNotice[]> {
  try {
    const memory = await params.memory.rememberOne(
      {
        kind: 'fact',
        content,
        importance: 0.8,
        scope: 'assistant',
        assistantId: params.assistantId,
        source: 'manual',
        sourceConversationId: params.conversationId,
        sourceMessageId: params.sourceMessageId,
      },
      params.signal,
    );
    return [{ id: memory.id, content: memory.content }];
  } catch (error) {
    console.warn(
      `[wbfm] 显式记忆写入失败：${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

async function forget(params: MemoryIntentParams, query: string): Promise<MemoryNotice[]> {
  try {
    const recalled = await params.memory.recall(query, {
      assistantId: params.assistantId,
      conversationId: params.conversationId,
      signal: params.signal,
    });
    const targets = recalled
      .filter((memory) => memory.score >= FORGET_MIN_SCORE)
      .slice(0, FORGET_MAX_ITEMS);
    for (const target of targets) {
      await params.memory.update(target.id, { status: 'archived' }, params.signal);
    }
  } catch (error) {
    console.warn(
      `[wbfm] 显式记忆归档失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  // 归档不放进「已记住」提示条，审计事件在记忆面板可见
  return [];
}
