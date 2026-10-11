/**
 * 流式句子切分器（借鉴 Open-LLM-VTuber 的「首句遇逗号即出声」策略）。
 *
 * LLM 以 delta 流式吐字，TTS 若等整段结束才合成，首句延迟很差。规则：
 * - 遇句末标点（。！？!?；; 换行、省略号）立即成句；
 * - 本句首个「句末标点」出现之前，第一次遇到逗号且可见字数 ≥ MIN_FIRST_CLAUSE
 *   时提前出一段（faster first response）；之后逗号不再提前切，等待句末标点；
 * - 纯函数、不感知表情标签（[joy] 等由 TTS 文本预处理器负责）。
 */

const TERMINAL_PUNCT = new Set(['。', '！', '？', '!', '?', '；', ';', '\n']);
const CLAUSE_PUNCT = new Set(['，', ',', '、']);
const ELLIPSIS = new Set(['…', '.']);

/** 首次按逗号提前切分所需的最少可见字符数（避免一个「嗯，」就触发合成） */
export const MIN_FIRST_CLAUSE = 3;

/** 单块 TTS 合成目标长度（字）：超长句二次切块，压低单句合成尖峰与首音延迟 */
export const MAX_TTS_CHUNK = 40;

/** 软断点（切块时优先在此断开，标点保留在前一块尾部） */
const SOFT_BREAK_RE = /(?<=[，、；;：])/;

/** markdown 表格分隔行 / 水平分隔线 / 代码围栏：整行不朗读 */
function isNoiseOnlyLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('```')) return true;
  // 去掉首尾管道与空白后，表格分隔行形如 ---|--- 或 :---:|:---
  const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').replace(/\s/g, '');
  if (/^:?-{2,}:?(\|:?-{2,}:?)*$/.test(cells)) return true;
  return /^(-{3,}|\*{3,}|_{3,})$/.test(cells);
}

/**
 * 去掉表情/动作标签与 markdown 噪声，得到「可朗读」文本。
 * - 表格管道 | → 逗号（保留单元格内容的可听停顿）；
 * - 表格分隔行（|:---:|）、水平分隔线（---）、代码围栏、URL 整段剔除。
 */
export function stripForTts(text: string): string {
  return text
    .split('\n')
    .filter((line) => !isNoiseOnlyLine(line))
    .join(' ')
    .replace(/\[[^\]]*\]/g, '') // [joy] 表情标签
    .replace(/https?:\/\/\S+|www\.\S+/gi, '') // URL
    // 表格行首尾管道直接删（避免产生无意义的首尾逗号），行内管道转逗号保留停顿
    .replace(/^\s*[|｜]\s*/, '')
    .replace(/\s*[|｜]\s*$/, '')
    .replace(/\s*[|｜]\s*/g, '，')
    .replace(/[*_#>`~-]/g, '') // markdown 口语噪声
    .replace(/\s+/g, ' ')
    .replace(/，{2,}/g, '，')
    .trim();
}

/**
 * 超长可朗读文本二次切块（stripForTts 之后调用）：
 * - 优先在软标点（，、；：）边界贪心打包到 maxLen；
 * - 无标点的长段在空格（英文词边界）处断，仍超长则按字硬切（中文无害）；
 * - 拼接结果恒等于入参（除首尾空白），顺序稳定，供逐块合成后顺序播放。
 */
export function chunkForTts(text: string, maxLen: number = MAX_TTS_CHUNK): string[] {
  const input = text.trim();
  if (!input) return [];
  const chunks: string[] = [];
  let buffer = '';

  const hardSplit = (segment: string) => {
    let rest = segment;
    while (rest.length > maxLen) {
      const windowText = rest.slice(0, maxLen + 1);
      const spaceAt = windowText.lastIndexOf(' ');
      const cut = spaceAt > maxLen / 2 ? spaceAt : maxLen;
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) buffer = rest;
  };

  for (const segment of input.split(SOFT_BREAK_RE).filter(Boolean)) {
    if (segment.length > maxLen) {
      if (buffer) {
        chunks.push(buffer);
        buffer = '';
      }
      hardSplit(segment);
    } else if ((buffer + segment).length > maxLen) {
      chunks.push(buffer);
      buffer = segment;
    } else {
      buffer += segment;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks.filter(Boolean);
}

function visibleLength(text: string): number {
  return stripForTts(text).replace(/[\s,.!?，。！？、；：""''（）()]/g, '').length;
}

export interface SplitterOptions {
  minFirstClause?: number;
}

/**
 * 有状态流式切分器：每个对话轮次 new 一个或调用 reset()。
 * push/flush 返回的都是「已完成切分点」的片段（原文，未做 strip）。
 */
export class StreamingSentenceSplitter {
  private buffer = '';
  private firstClauseDone = false;
  private readonly minFirstClause: number;

  constructor(options: SplitterOptions = {}) {
    this.minFirstClause = options.minFirstClause ?? MIN_FIRST_CLAUSE;
  }

  reset(): void {
    this.buffer = '';
    this.firstClauseDone = false;
  }

  /** 喂入一段 delta，返回本次可以送去 TTS 的片段（按顺序）。 */
  push(chunk: string): string[] {
    if (!chunk) return [];
    this.buffer += chunk;
    const out: string[] = [];
    let sliceStart = 0;

    const cutAt = (endExclusive: number) => {
      const fragment = this.buffer.slice(sliceStart, endExclusive);
      sliceStart = endExclusive;
      if (fragment.trim()) out.push(fragment.trim());
    };

    for (let i = 0; i < this.buffer.length; i += 1) {
      const ch = this.buffer[i] ?? '';
      if (TERMINAL_PUNCT.has(ch) || (ELLIPSIS.has(ch) && this.buffer[i + 1] === ch)) {
        cutAt(i + 1);
        // 省略号两个字符一次消费
        if (ELLIPSIS.has(ch) && this.buffer[i + 1] === ch) i += 1;
        // 句末之后重置本句状态：后续内容允许再次「首逗号快出」
        this.firstClauseDone = false;
        this.buffer = this.buffer.slice(sliceStart);
        sliceStart = 0;
        i = -1; // 重新扫描剩余 buffer
      } else if (
        !this.firstClauseDone &&
        CLAUSE_PUNCT.has(ch) &&
        visibleLength(this.buffer.slice(0, i + 1)) >= this.minFirstClause
      ) {
        cutAt(i + 1);
        this.firstClauseDone = true;
        this.buffer = this.buffer.slice(sliceStart);
        sliceStart = 0;
        i = -1;
      }
    }

    if (sliceStart > 0) this.buffer = this.buffer.slice(sliceStart);
    return out;
  }

  /** 流结束：吐出残余内容（无成句标点的尾巴）；空文本返回空数组。 */
  flush(): string[] {
    const tail = this.buffer.trim();
    this.buffer = '';
    this.firstClauseDone = false;
    return tail ? [tail] : [];
  }
}

/** 一次性切分（测试与非流式场景便利函数）。 */
export function splitSentences(fullText: string, options?: SplitterOptions): string[] {
  const splitter = new StreamingSentenceSplitter(options);
  const parts = splitter.push(fullText);
  parts.push(...splitter.flush());
  return parts;
}
