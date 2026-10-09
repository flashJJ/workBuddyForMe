import { MEMORY_EXTRACT_MAX_ITEMS } from '@wbfm/shared/constants';
import { MEMORY_KINDS, type MemoryKind } from '@wbfm/shared/types';
import { traceAsync, type ChatMessage, type TraceHandle } from '@wbfm/ai';
import { z } from 'zod';
import type { ResolvedChatTarget } from '../chat/model-resolver';

/** v0.5 M3：回合后记忆提取。失败一律抛错，由调用方静默吞掉，绝不阻塞主流程。 */

const EXTRACT_SYSTEM_INSTRUCTION =
  '你是长期记忆提取助手。阅读用户与 AI 助手的一轮对话，从中提取【值得长期保留】的信息。\n' +
  '只提取以下三类：\n' +
  '- fact：用户的身份、背景、长期事实（职业、项目、所在地、关系等）；\n' +
  '- preference：明确表达的偏好、习惯、约定（语言风格、工具选择、忌口等）；\n' +
  '- event：已发生且日后可能被提及的重要事件（考试、决定、计划）。\n' +
  '要求：\n' +
  '1. 只提取跨对话仍有价值的信息；寒暄、一次性问题、临时计算一律不提取；\n' +
  '2. 每条 content 是一句自包含的客观陈述（中文，1-500 字），不写“用户提到”这类前缀；\n' +
  '3. importance 取 0 到 1：0.8+ 核心身份/强烈偏好，0.5-0.8 一般重要，0.5 以下仅参考；\n' +
  `4. 最多 ${MEMORY_EXTRACT_MAX_ITEMS} 条；没有值得记忆的内容时输出 []；\n` +
  '5. 严格只输出 JSON 数组，不要代码块、不要解释。';

const extractedMemorySchema = z
  .array(
    z.object({
      kind: z.enum([...MEMORY_KINDS] as [MemoryKind, ...MemoryKind[]]),
      content: z.string().trim().min(1).max(500),
      importance: z.number().min(0).max(1),
    }),
  )
  .max(MEMORY_EXTRACT_MAX_ITEMS);

export interface ExtractedMemory {
  kind: MemoryKind;
  content: string;
  importance: number;
}

export function buildExtractMessages(userContent: string, assistantContent: string): ChatMessage[] {
  return [
    { role: 'system', content: EXTRACT_SYSTEM_INSTRUCTION },
    {
      role: 'user',
      content:
        `【用户】\n${userContent}\n\n【AI 助手】\n${assistantContent}\n\n` +
        '请输出 JSON 数组。',
    },
  ];
}

/** 容忍模型包裹代码围栏或在 JSON 外加解释性文字 */
export function parseExtractedMemories(raw: string): ExtractedMemory[] {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('记忆提取结果中未找到 JSON 数组');
  }
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  return extractedMemorySchema.parse(parsed).map((item) => ({
    kind: item.kind,
    content: item.content,
    importance: Math.round(item.importance * 100) / 100,
  }));
}

export interface ExtractMemoriesInput {
  target: ResolvedChatTarget;
  userContent: string;
  assistantContent: string;
  signal?: AbortSignal;
  traceParent?: TraceHandle | null;
}

/** 调对话模型（temperature 0）提取候选记忆；空内容或无信号输入直接返回空数组 */
export async function extractTurnMemories(input: ExtractMemoriesInput): Promise<ExtractedMemory[]> {
  if (!input.userContent.trim() || !input.assistantContent.trim()) return [];
  const messages = buildExtractMessages(input.userContent, input.assistantContent);
  return traceAsync(
    {
      name: 'memory_extract',
      runType: 'llm',
      parent: input.traceParent ?? null,
      inputs: { userLength: input.userContent.length },
    },
    async () => {
      const stream = input.target.provider.chatStream({
        model: input.target.model.modelId,
        messages,
        temperature: 0,
        signal: input.signal,
      });
      let raw = '';
      for await (const chunk of stream) raw += chunk.delta;
      if (!raw.trim()) throw new Error('记忆提取结果为空');
      const memories = parseExtractedMemories(raw);
      return memories;
    },
    (memories) => ({ extracted: memories.length }),
  );
}
