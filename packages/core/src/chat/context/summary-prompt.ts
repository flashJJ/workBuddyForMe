import type { Message } from '@wbfm/shared/types';
import type { ChatMessage } from '@wbfm/ai';

/**
 * 摘要请求提示词（v4.8.1 从 summarizer 拆出守行数门禁）：
 * - structured：要求 JSON 载荷，供事实落库与保真校验；
 * - plain：小窗口退化路径，只要求纯文本摘要。
 */

const SUMMARY_SYSTEM_INSTRUCTION =
  '你是对话摘要助手。把给定的早期对话压缩为结构化中文摘要，供后续对话参考。\n' +
  '只输出一个 JSON 对象，不要解释、不要代码块，格式：\n' +
  '{"summary":"...","facts":[{"key":"...","value":"...","unit":null,"validFrom":null}],' +
  '"decisions":["..."],"open_loops":["..."]}\n' +
  '要求：\n' +
  '1. summary 保留：用户身份与称呼、明确的偏好/约定、已做决定、待办与未解决问题、关键事实与结论；\n' +
  '2. facts 只放稳定可复用的事实，key 用稳定的英文小写下划线键（如 residence_city、budget），' +
  '同一主体的属性复用同一 key；unit/validFrom 缺失填 null；\n' +
  '3. decisions 记录已经确定的决定，open_loops 记录尚未解决的问题；\n' +
  '4. 原文出现的数字、日期、金额必须原样保留在 summary 或 facts 中；\n' +
  '5. 已有摘要时做增量合并：保留旧摘要中仍有效的要点，补充/更新新对话内容；\n' +
  '6. 删除寒暄、重复内容、与长期上下文无关的临时细节。';

/** 小窗口退化用的纯文本摘要指令（不要求 JSON，避免 7B 级模型编造事实） */
const PLAIN_SUMMARY_INSTRUCTION =
  '你是对话摘要助手。把给定的早期对话压缩为简洁的中文摘要，供后续对话参考。\n' +
  '要求：\n' +
  '1. 保留用户身份与称呼、明确的偏好/约定、已做决定、待办与未解决问题、关键事实与结论；\n' +
  '2. 原文出现的数字、日期、金额必须原样保留；\n' +
  '3. 已有摘要时做增量合并：保留旧摘要中仍有效的要点，补充/更新新对话内容；\n' +
  '4. 删除寒暄、重复内容与无关细节；只输出摘要正文，不要标题、不要 JSON、不要解释。';

/** 单条消息转摘要用文本行（图片消息无可摘要文本） */
export function transcriptLine(message: Message): string {
  const role = message.role === 'user' ? '用户' : '助手';
  const content = message.content.trim();
  return `${role}：${content || '（图片/附件消息）'}`;
}

/**
 * 构造摘要请求：旧摘要（若有）+ 待折叠转写。
 * 温度由调用方固定为 0；plain=true 时用小窗口纯文本指令。
 */
export function buildSummaryMessages(
  previousSummary: string | null,
  folded: Message[],
  plain = false,
): ChatMessage[] {
  const transcript = folded.map(transcriptLine).join('\n');
  const userParts = [
    previousSummary ? `【已有摘要】\n${previousSummary}` : '',
    `【需要合并的早期对话】\n${transcript}`,
    '请输出合并后的最新摘要。',
  ].filter(Boolean);
  return [
    {
      role: 'system',
      content: plain ? PLAIN_SUMMARY_INSTRUCTION : SUMMARY_SYSTEM_INSTRUCTION,
    },
    { role: 'user', content: userParts.join('\n\n') },
  ];
}
