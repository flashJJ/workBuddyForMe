import { CONTEXT_BUDGET_SAFETY_RATIO, RAG_CHUNK_MIN_TOKENS } from '@wbfm/shared/constants';
import type { Assistant, Message } from '@wbfm/shared/types';
import type { ChatMessage } from '@wbfm/ai';
import type { RagContext } from './types';
import type { ResolvedImage } from '../services/attachment-service';
import { fitContextBlock } from '../retrieval/context-formatter';
import {
  assembleHistoryWithinBudget,
  estimateMessageTokens,
  estimateTokens,
  resolveReserveTokens,
  truncateToTokens,
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

/** RAG 资料块的引导语（装配预算时需计入） */
export const RAG_INTRO =
  '请优先参考以下检索到的资料回答；资料不足时再使用你的常识，并在回答中给出引用。\n\n【参考资料】\n';

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
    parts.push(RAG_INTRO + rag.contextBlock);
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
  const mapped = history.map(
    (message): ChatMessage => ({ role: message.role, content: toAiContent(message, images) }),
  );

  if (!budget) {
    const systemPrompt = buildSystemPrompt(assistant, rag, null, null, null);
    const prefix: ChatMessage[] = systemPrompt
      ? [{ role: 'system', content: systemPrompt }]
      : [];
    return { messages: [...prefix, ...mapped], stats: null };
  }

  // 安全窗口：字符粗估相对真实 tokenizer 普遍低估（尤其中文/JSON/代码），
  // 按 0.9 系数收缩，所有区块（含 RAG）都在这个窗口内做账，杜绝超长请求打到上游。
  const usableWindow = Math.floor(budget.contextWindow * CONTEXT_BUDGET_SAFETY_RATIO);
  const reserveTokens = resolveReserveTokens(budget.lastCompletionTokens);
  const summary = budget.summary ?? null;
  const memoryBlock = budget.memoryBlock ?? null;
  const skillBlock = budget.skillBlock ?? null;

  // 1) 先装不含 RAG 的固定系统块（人设/表情/摘要/记忆/技能）
  const fixedSystem = buildSystemPrompt(assistant, null, summary, memoryBlock, skillBlock);
  const fixedTokens = fixedSystem ? estimateTokens(fixedSystem) : 0;
  // 2) 本轮用户消息恒保留：先把它的占用从 RAG 预算里扣掉，防止资料挤掉当前问题
  const userLastTokens =
    mapped.length > 0 ? estimateMessageTokens(mapped[mapped.length - 1]!) : 0;
  // 3) RAG 在剩余空间内贪心装配；放不下整块省略（降级为无资料问答，而不是上游 400）
  const ragCapacity =
    usableWindow -
    reserveTokens -
    budget.toolsTokens -
    fixedTokens -
    userLastTokens -
    estimateTokens(RAG_INTRO) -
    PER_MESSAGE_STRUCTURE_TOKENS;
  const effectiveRag = fitRagToBudget(rag, ragCapacity);

  const systemPrompt = buildSystemPrompt(assistant, effectiveRag, summary, memoryBlock, skillBlock);
  const prefix: ChatMessage[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }]
    : [];

  const { kept, stats } = assembleHistoryWithinBudget({
    history: mapped,
    contextWindow: usableWindow,
    systemTokens: systemPrompt ? estimateTokens(systemPrompt) : 0,
    toolsTokens: budget.toolsTokens,
    lastCompletionTokens: budget.lastCompletionTokens,
  });
  return { messages: [...prefix, ...kept], stats };
}

/** 系统消息封装与区块拼接的结构余量（role/分隔符等无法逐段计入的开销） */
const PER_MESSAGE_STRUCTURE_TOKENS = 16;

/**
 * 按剩余预算收敛 RAG 资料：
 * - 结构化片段（正常路径）：按相关性顺序整条装入，仅首条可截断；
 * - 仅预格式化块（兼容旧调用/测试）：按 token 整体截断，低于注入下限则省略。
 */
function fitRagToBudget(rag: RagContext | null, capacity: number): RagContext | null {
  if (!rag) return null;
  if (rag.chunks.length > 0) {
    const fitted = fitContextBlock(rag.chunks, Math.max(0, capacity));
    return fitted.block ? { ...rag, contextBlock: fitted.block } : null;
  }
  if (rag.contextBlock && capacity >= RAG_CHUNK_MIN_TOKENS) {
    const clipped = truncateToTokens(rag.contextBlock, capacity);
    if (estimateTokens(clipped) >= RAG_CHUNK_MIN_TOKENS) {
      return { ...rag, contextBlock: clipped };
    }
  }
  return null;
}
