/**
 * v1.6 情绪信号尾块的文本解析与剥离（纯函数，core 落库/TTS 与 web 流式渲染共用）。
 *
 * 协议：助手正文结束后另起一行输出一个 JSON 代码块——
 *   ```json
 *   {"emotion":"joy","intensity":0.7,"soulEvent":"praise"}
 *   ```
 * 也容忍不带围栏、紧贴正文末尾的裸 JSON 对象（弱模型常见形态）。
 *
 * 安全门：只承认「根键全部属于协议键 且 至少含 emotion/soulEvent 之一」的对象，
 * 因此普通代码示例、含其他字段的 JSON 片段不会被误吞。
 */
import { emotionSignalSchema, type EmotionSignal } from './emotion';

/** 尾块只允许这些根键（其他键存在即判定不是本协议，避免误吞代码示例） */
const KNOWN_KEYS = new Set(['emotion', 'intensity', 'soulEvent']);
/** 至少命中一个语义键（intensity 单独出现可能是普通数值 JSON） */
const SEMANTIC_KEYS = ['"emotion"', '"soulEvent"'];
/** 流式半截探测时的搜索窗口（足够覆盖尾块体积） */
const PARTIAL_SCAN_LIMIT = 400;
/** 半截围栏/裸对象允许的最大尾部长度，超出判定为普通内容 */
const PARTIAL_TAIL_LIMIT = 200;

/** 完整围栏块：```json … ``` 或 ``` … ```，位于文本末尾（允许尾随空白） */
const FENCED_BLOCK_PATTERN =
  /```(?:json|JSON)?\s*(\{[\s\S]*?\})\s*```\s*$/;

/** 校验候选 JSON 是否为协议对象；通过则返回解析结果（逐叶容错），否则 null */
function acceptObject(raw: string): EmotionSignal | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const keys = Object.keys(parsed as Record<string, unknown>);
  if (keys.length === 0) return null;
  if (!keys.every((key) => KNOWN_KEYS.has(key))) return null;
  if (!SEMANTIC_KEYS.some((token) => raw.includes(token))) return null;
  return emotionSignalSchema.parse(parsed);
}

/**
 * 扫描全部平衡的花括号对象，返回最后一个通过协议校验的对象及其起点。
 * 字符串/转义状态保证 JSON 内部的括号不参与配对；嵌套对象结束时弹栈。
 */
function findTrailingObject(text: string): { start: number; object: EmotionSignal } | null {
  let lastAccepted: { start: number; object: EmotionSignal } | null = null;
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (depth === 0) {
      if (ch === '{') {
        start = i;
        depth = 1;
        inString = false;
        escaped = false;
      }
      continue;
    }
    if (escaped) {
      escaped = false;
    } else if (ch === '\\' && inString) {
      escaped = true;
    } else if (ch === '"') {
      inString = !inString;
    } else if (!inString) {
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const accepted = acceptObject(text.slice(start, i + 1));
          if (accepted) lastAccepted = { start, object: accepted };
          start = -1;
        }
      }
    }
  }
  return lastAccepted;
}

/** 剔除文本末尾围栏块（返回剔除后的正文与信号；无则原样） */
function extractFenced(text: string): { cleaned: string; signal: EmotionSignal } | null {
  const match = FENCED_BLOCK_PATTERN.exec(text);
  if (!match) return null;
  const signal = acceptObject(match[1]!);
  if (!signal) return null;
  return { cleaned: text.slice(0, match.index).trimEnd(), signal };
}

/**
 * 完整提取：返回剥离尾块后的正文与信号。
 * 优先识别围栏块，其次识别末尾裸 JSON 对象；均不命中返回 null（正文原样）。
 */
export function extractEmotionSignal(text: string): {
  cleaned: string;
  signal: EmotionSignal;
} | null {
  const fenced = extractFenced(text);
  if (fenced) return fenced;
  const trailing = text.trimEnd();
  if (!trailing.endsWith('}')) return null;
  const found = findTrailingObject(trailing);
  if (!found) return null;
  // 裸对象前必须是换行/句末空白，避免吞掉行内代码（如 const x={…}）
  const before = trailing[found.start - 1] ?? '\n';
  if (!/[\s。！？!?；;]$/.test(before)) return null;
  return { cleaned: trailing.slice(0, found.start).trimEnd(), signal: found.object };
}

/**
 * 流式安全剥离：除完整尾块外，也隐藏「正在生成的半截尾块」，
 * 供实时气泡与 TTS 差分使用。半截识别刻意保守：
 * 1. 文本末尾存在未闭合的 ```（json）围栏，且尾部窗口出现协议键记号；
 * 2. 文本末尾是未闭合的 { 开头残段且含协议键记号（防吞普通句子里的 {）。
 */
export function stripEmotionSignalBlock(text: string): string {
  const complete = extractEmotionSignal(text);
  if (complete) return complete.cleaned;

  const tail = text.slice(-PARTIAL_SCAN_LIMIT);

  // 1) 未闭合围栏：最后一个 ``` 之后没有成对闭合
  const fenceMarkers = [...tail.matchAll(/```/g)];
  if (fenceMarkers.length > 0 && fenceMarkers.length % 2 === 1) {
    const lastFence = fenceMarkers[fenceMarkers.length - 1]!;
    const afterFence = tail.slice(lastFence.index! + 3);
    const headerMatch = /^\s*(json|JSON)?\s*([\s\S]*)$/.exec(afterFence);
    const body = headerMatch?.[2] ?? '';
    if (SEMANTIC_KEYS.some((token) => body.includes(token)) && body.length <= PARTIAL_TAIL_LIMIT) {
      return text.slice(0, text.length - tail.length + lastFence.index!).trimEnd();
    }
  }

  // 2) 未闭合裸对象残段：最后一个 { 之后含协议键记号、无闭合 }
  const lastBrace = tail.lastIndexOf('{');
  if (lastBrace >= 0) {
    const fragment = tail.slice(lastBrace);
    const beforeBrace = tail[lastBrace - 1] ?? '\n';
    if (
      !fragment.includes('}') &&
      fragment.length <= PARTIAL_TAIL_LIMIT &&
      /[\s。！？!?；;]$/.test(beforeBrace) &&
      SEMANTIC_KEYS.some((token) => fragment.includes(token))
    ) {
      return text.slice(0, text.length - tail.length + lastBrace).trimEnd();
    }
  }

  return text;
}
