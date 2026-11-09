/**
 * 会话下栏「朗读」文本抽取（纯函数，无 DOM/网络）。
 *
 * /api/voice/tts 单次上限 2000 字（voiceTtsRequestSchema），这里按句切块，
 * 每块留出余量后逐段合成，避免长回复被截断或一次请求过大。
 */
import type { Message } from '@wbfm/shared/types';

/** 单块朗读文本上限（接口上限 2000，留 200 字余量） */
export const READ_ALOUD_CHUNK_MAX = 1800;

/** Markdown → 可朗读纯文本：去掉代码块/表格/标记符号，保留正文与链接文字 */
export function toSpeakableText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, (row) => row.replace(/\|/g, ' '))
    .replace(/[*_~`]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** 取最后一条有正文的助手消息 → 可朗读文本；没有则 null */
export function latestAssistantSpeech(messages: Message[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== 'assistant' || !message.content) continue;
    const text = toSpeakableText(message.content);
    if (text) return text;
  }
  return null;
}

/** 按句切块（每块 ≤ max）；超长单句硬切，保证不超过接口上限 */
export function splitSpeechChunks(text: string, max = READ_ALOUD_CHUNK_MAX): string[] {
  const sentences = text.match(/[^。！？!?；;.\n]+[。！？!?；;.\n]?/g) ?? [];
  const chunks: string[] = [];
  let current = '';
  const flush = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = '';
  };
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length > max) {
      flush();
      for (let start = 0; start < sentence.length; start += max) {
        chunks.push(sentence.slice(start, start + max));
      }
      continue;
    }
    if (current.length + sentence.length > max) flush();
    current += current ? ` ${sentence}` : sentence;
  }
  flush();
  return chunks;
}
