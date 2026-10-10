/**
 * 分片缝合（v1.3 M2，纯函数）。
 *
 * 编译器在摄取完成后才运行，库里只有分片（含重叠窗口），拿不到归一化全文。
 * 本模块把有序分片重建成「虚拟文档」：沿用上一分片尾部与下一分片头部的最长
 * 公共前后缀去重重叠区，逐片只追加新增后缀。重叠长度由知识库 chunkOverlap
 * 配置界定（chunking 的尾部窗口恰为下一片的开头 atom），保证同输入恒等输出。
 *
 * 同时产出每个虚拟字符区间归属分片的 run 表，供 locateMentions 做句子→chunk
 * 的相交映射（页/段坐标随 run 携带）。
 */

export interface StitchChunk {
  id: number;
  ordinal: number;
  content: string;
  pageNo?: number | null;
  paragraphNo?: number | null;
}

export interface CharRun {
  /** 虚拟文档内半开字符区间 */
  start: number;
  end: number;
  chunkId: number;
  ordinal: number;
  pageNo: number | null;
  paragraphNo: number | null;
}

export interface StitchedDocument {
  /** 缝合后的虚拟全文（抽取器在这一份文本上跑，偏移即虚拟坐标） */
  text: string;
  /** 有序、不重叠、覆盖 [0,text.length) 的归属区间 */
  runs: CharRun[];
}

/**
 * 计算 next 内容与已缝合文本尾部的重叠字符数：
 * 取「next 前缀 == text 后缀」的最长 k，上界 maxOverlap（分片窗口+连接留白）。
 */
export function overlapLength(text: string, next: string, maxOverlap: number): number {
  const upper = Math.min(next.length, Math.max(0, maxOverlap));
  for (let k = upper; k > 0; k -= 1) {
    if (text.endsWith(next.slice(0, k))) return k;
  }
  return 0;
}

/**
 * 缝合分片为虚拟文档。
 * @param chunks 分片（乱序可，内部按 ordinal 排序）；空数组返回空文档
 * @param options.maxOverlap 重叠窗口上界（建议传知识库 chunkOverlap + 2）；
 *        缺省按当前片内容长度放开（最长公共前后缀，仍为确定性结果）
 */
export function stitchChunks(
  chunks: StitchChunk[],
  options: { maxOverlap?: number } = {},
): StitchedDocument {
  const ordered = chunks.slice().sort((a, b) => a.ordinal - b.ordinal);
  const runs: CharRun[] = [];
  let text = '';

  for (const chunk of ordered) {
    const bound = options.maxOverlap ?? chunk.content.length;
    const overlap = overlapLength(text, chunk.content, bound);
    const suffix = chunk.content.slice(overlap);
    if (suffix.length === 0) continue;
    const start = text.length;
    text += suffix;
    const last = runs[runs.length - 1];
    // 同一分片可能产生多个 run（重叠区被前片拥有），合并相邻同片区间
    if (last && last.chunkId === chunk.id && last.end === start) {
      last.end = text.length;
    } else {
      runs.push({
        start,
        end: text.length,
        chunkId: chunk.id,
        ordinal: chunk.ordinal,
        pageNo: chunk.pageNo ?? null,
        paragraphNo: chunk.paragraphNo ?? null,
      });
    }
  }
  return { text, runs };
}
