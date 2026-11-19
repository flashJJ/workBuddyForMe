/**
 * 会话下栏「朗读」文本抽取（纯函数，无 DOM/网络）。
 *
 * 注意：分块上限不再对齐接口 2000 字上限，而是对齐 TTS 引擎的短句粒度。
 * 实测把 1800 字一次性交给 MeloTTS 会生成极慢（本机曾达 500s），
 * 且要等整段合成完才出声；按 40 字短句切块可让首句很快出声。
 * 切块规则与服务端流式朗读（@wbfm/voice 的 chunkForTts）保持一致；
 * 此处不直接 import 该包，避免把含 node:fs/node:path 的服务端代码打进浏览器包。
 */
import type { Message } from '@wbfm/shared/types';

/** 单块朗读文本上限：与流式朗读共用同一 TTS 短句粒度（40 字） */
export const READ_ALOUD_CHUNK_MAX = 40;

/** 软断点：逗号/顿号等标点后优先断开 */
const SOFT_BREAK_RE = /(?<=[，、；;：])/;

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

/** 按 TTS 短句粒度切块（≤ max 字）；超长无标点段落按字硬切 */
export function splitSpeechChunks(text: string, max = READ_ALOUD_CHUNK_MAX): string[] {
  // 换行在朗读里等价于停顿，统一成空格，避免块内出现回车
  const input = text.replace(/\s+/g, ' ').trim();
  if (!input) return [];
  const chunks: string[] = [];
  let buffer = '';

  const hardSplit = (segment: string) => {
    let rest = segment;
    while (rest.length > max) {
      const windowText = rest.slice(0, max + 1);
      const spaceAt = windowText.lastIndexOf(' ');
      const cut = spaceAt > max / 2 ? spaceAt : max;
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) buffer = rest;
  };

  for (const segment of input.split(SOFT_BREAK_RE).filter(Boolean)) {
    if (segment.length > max) {
      if (buffer) {
        chunks.push(buffer);
        buffer = '';
      }
      hardSplit(segment);
    } else if ((buffer + segment).length > max) {
      chunks.push(buffer);
      buffer = segment;
    } else {
      buffer += segment;
    }
  }
  if (buffer) chunks.push(buffer);
  // 纯标点块不送引擎（MeloTTS 会因全部 OOV 直接失败）
  return chunks.filter((chunk) => /[\p{L}\p{N}]/u.test(chunk));
}
