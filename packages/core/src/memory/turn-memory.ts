import type { Memory, RecalledMemoryPayload } from '@wbfm/shared';
import type { TraceHandle } from '@wbfm/ai';
import type { ResolvedChatTarget } from '../chat/model-resolver';
import type { OrchestratorEvent } from '../chat/types';
import { extractTurnMemories } from './extractor';
import type { MemoryService } from './memory-service';

/** v0.5 M3：对话回合与记忆服务之间的胶水，编排器只负责调用与吞错边界。 */

const KIND_LABELS: Record<Memory['kind'], string> = {
  fact: '事实',
  preference: '偏好',
  event: '事件',
};

/** 召回记忆格式化为 system 区块正文；无记忆返回 null */
export function formatMemoryBlock(memories: Memory[]): string | null {
  if (memories.length === 0) return null;
  return memories.map((m) => `- ［${KIND_LABELS[m.kind]}］${m.content}`).join('\n');
}

/** SSE memories 事件负载（只下发展示必需字段，不暴露内部 id 之外的管理字段） */
export function toRecalledPayload(memories: Memory[]): RecalledMemoryPayload[] {
  return memories.map((m) => ({ id: m.id, kind: m.kind, content: m.content }));
}

export interface RecallTurnParams {
  memory: MemoryService;
  query: string;
  signal?: AbortSignal;
  traceParent?: TraceHandle | null;
}

/** 回合前召回；服务内部已对未配置嵌入模型等场景返回空数组 */
export async function recallTurnMemories(params: RecallTurnParams): Promise<Memory[]> {
  return params.memory.recall(params.query, {
    signal: params.signal,
    traceParent: params.traceParent,
  });
}

/**
 * 编排器专用：召回记忆并在命中时 yield memories 事件；
 * 召回失败仅告警、返回空数组，绝不阻塞回答。
 */
export async function* safeRecallEvent(
  params: RecallTurnParams,
): AsyncGenerator<OrchestratorEvent, Memory[]> {
  try {
    const memories = await recallTurnMemories(params);
    if (memories.length > 0) {
      yield { event: 'memories', data: { memories: toRecalledPayload(memories) } };
    }
    return memories;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `[wbfm] 长期记忆召回失败，本轮不注入记忆：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return [];
  }
}

export interface PostTurnMemoryParams {
  memory: MemoryService;
  target: ResolvedChatTarget;
  userContent: string;
  assistantContent: string;
  conversationId: string;
  signal?: AbortSignal;
  traceParent?: TraceHandle | null;
}

/**
 * 回合成功后提取候选记忆并入库（去重合并）。
 * 失败（模型不可用/JSON 非法/嵌入失败）一律静默，仅告警，绝不影响已完成的回答。
 */
export async function runPostTurnMemory(params: PostTurnMemoryParams): Promise<void> {
  try {
    const candidates = await extractTurnMemories({
      target: params.target,
      userContent: params.userContent,
      assistantContent: params.assistantContent,
      signal: params.signal,
      traceParent: params.traceParent,
    });
    if (candidates.length === 0) return;
    await params.memory.rememberCandidates(candidates, {
      sourceConversationId: params.conversationId,
      signal: params.signal,
      traceParent: params.traceParent,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `[wbfm] 长期记忆提取失败，本轮不写入记忆：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
