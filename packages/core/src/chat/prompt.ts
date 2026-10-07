import type { Assistant, Message } from '@wbfm/shared';
import type { ChatMessage } from '@wbfm/ai';
import type { RagContext } from './types';
import type { ResolvedImage } from '../services/attachment-service';
import {
  assembleHistoryWithinBudget,
  estimateTokens,
  type HistoryBudgetStats,
} from './context-budget';
import { toAiContent } from './multimodal';

/**
 * v1.0 M3：表情指令片段（仅助手开启 expressionEnabled 时注入）。
 * 标签集合与 shared/schemas/expression.ts、客户端 Live2D 映射严格同源。
 */
export const EXPRESSION_DIRECTIVE_BLOCK = [
  '【表情指令】你的回复会驱动一个 Live2D 虚拟形象，请遵守：',
  '1. 在每段情绪开始处插入且仅可插入以下标签之一：',
  '[neutral] 平静、[joy] 开心、[anger] 生气、[sadness] 难过、[surprise] 惊讶、[fear] 害怕、[disgust] 厌恶、[smirk] 得意/坏笑；',
  '2. 标签是控制信号，不是回复内容：不要解释、不要念出标签、不要编造集合之外的标签，也不要堆叠多个标签；',
  '3. 情绪没有变化时不重复插入标签；整段情绪平稳时可只用一个 [neutral] 或完全不加；',
  '4. 标签放在句首或段落首，例如：[joy] 太好了，我们成功了！',
].join('\n');

/** 组装系统提示词：助手人设 + 表情指令 + 可选对话摘要 + 可选长期记忆 + 可选技能流程块 + 可选 RAG 参考资料块 */
export function buildSystemPrompt(
  assistant: Assistant,
  rag: RagContext | null,
  summary: string | null = null,
  memoryBlock: string | null = null,
  skillBlock: string | null = null,
): string {
  const parts = [assistant.systemPrompt.trim()];
  if (assistant.expressionEnabled) parts.push(EXPRESSION_DIRECTIVE_BLOCK);
  if (summary?.trim()) {
    parts.push('以下是本次对话早期内容的摘要，其中的事实与约定仍然有效：\n\n【对话摘要】\n' + summary.trim());
  }
  if (memoryBlock?.trim()) {
    parts.push(
      '以下是关于用户的长期记忆，回答时可自然利用；与当前问题无关时无需提及：\n\n' +
        '【长期记忆】\n' +
        memoryBlock.trim(),
    );
  }
  if (skillBlock?.trim()) {
    parts.push(skillBlock.trim());
  }
  if (rag?.contextBlock) {
    parts.push(
      '请优先参考以下检索到的资料回答；资料不足时再使用你的常识，并在回答中给出引用。\n\n' +
        '【参考资料】\n' +
        rag.contextBlock,
    );
  }
  return parts.filter(Boolean).join('\n\n');
}

/** v0.5 预算装配参数：模型上下文长度 + 工具声明占用 + 上次真实 completion 校准 */
export interface ChatBudgetOptions {
  /** 模型上下文长度（tokens）；兜底默认值由调用方应用 */
  contextWindow: number;
  /** 工具声明占用的 token 估算（无工具传 0） */
  toolsTokens: number;
  /** 上一轮助手响应的真实 completion tokens（无则 null） */
  lastCompletionTokens: number | null;
  /** 已持久化的对话递归摘要（注入 system，占用预算） */
  summary?: string | null;
  /** 回合前召回的长期记忆块（注入 system，占用预算） */
  memoryBlock?: string | null;
  /** v0.6 M3：启用技能的提示词模板块（注入 system，占用预算） */
  skillBlock?: string | null;
}

/**
 * 系统提示词 + 历史（含本轮用户消息），过滤空系统消息。
 * v0.3：图片片段经 images 映射解析为 data URL 后下发视觉模型。
 * v0.5：传入 budget 时按 token 预算从新到旧装配历史——
 * 先扣 system（含对话摘要与 RAG 资料块）与工具声明及输出预留，剩余预算装历史，装不下为止；
 * 不传 budget 时保持全量装配（向后兼容）。
 */
export function buildChatMessages(
  assistant: Assistant,
  history: Message[],
  rag: RagContext | null,
  images: Map<string, ResolvedImage> = new Map(),
  budget?: ChatBudgetOptions,
): { messages: ChatMessage[]; stats: HistoryBudgetStats | null } {
  const systemPrompt = buildSystemPrompt(
    assistant,
    rag,
    budget?.summary ?? null,
    budget?.memoryBlock ?? null,
    budget?.skillBlock ?? null,
  );
  const prefix: ChatMessage[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }]
    : [];
  const mapped = history.map(
    (message): ChatMessage => ({ role: message.role, content: toAiContent(message, images) }),
  );

  if (!budget) {
    return { messages: [...prefix, ...mapped], stats: null };
  }

  const { kept, stats } = assembleHistoryWithinBudget({
    history: mapped,
    contextWindow: budget.contextWindow,
    systemTokens: systemPrompt ? estimateTokens(systemPrompt) : 0,
    toolsTokens: budget.toolsTokens,
    lastCompletionTokens: budget.lastCompletionTokens,
  });
  return { messages: [...prefix, ...kept], stats };
}
