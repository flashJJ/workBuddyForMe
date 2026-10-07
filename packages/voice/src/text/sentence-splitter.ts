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

/** 去掉表情/动作标签与多余空白，得到「可朗读」文本（括号策略与 VTuber 一致：默认全去）。 */
export function stripForTts(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, '') // [joy] 表情标签
    .replace(/[*_#>`~]/g, '') // markdown 口语噪声
    .replace(/\s+/g, ' ')
    .trim();
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
