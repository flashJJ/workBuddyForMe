/**
 * 文档文本结构与分片坐标（v1.3 M0，纯函数无 I/O）。
 *
 * 摄取侧在拼出最终文本的同时记录「源段落块」在文本中的字符区间及其来源
 * 页码/段落序号；分片（chunkText 产物，自带 charStart/charEnd）据此反查
 * pageNo/paragraphNo。坐标全部相对「CRLF→LF、trim 后」的规范化文本——
 * 与 chunkText 的规范化口径一致，偏移可直接对齐。
 */

/** 一个源段落块：连续的一段非空文本，属于某页（非 PDF 为 null） */
export interface TextBlock {
  charStart: number;
  charEnd: number;
  /** PDF 页码（从 1）；非 PDF 文档为 null */
  pageNo: number | null;
  /** 文档内连续段落序号（从 1），跨页连续编号 */
  paragraphNo: number;
}

export interface StructuredText {
  /** 与历史提取结果逐字一致的最终文本（页间 '\n\n' 连接） */
  text: string;
  blocks: TextBlock[];
}

interface PagedInput {
  /** 真实 PDF 页码（从 1，空页也保留原页码调用，由本函数过滤空页） */
  pageNo: number;
  /** 已 trim 的该页文本；空串表示空白页，不进入文本 */
  text: string;
}

/**
 * 由逐页文本拼出最终文本并记录块结构（PDF，含文字层/OCR 混用场景）。
 * 拼接规则与旧实现严格一致：过滤空白页，页间 '\n\n'。
 * 页内按空行或单个换行拆为段落块（PDF 文本提取按行组织）。
 */
export function assemblePagedText(pages: readonly PagedInput[]): StructuredText {
  const present = pages.filter((p) => p.text.trim().length > 0);
  const text = present.map((p) => p.text.trim()).join('\n\n');

  const blocks: TextBlock[] = [];
  let cursor = 0;
  let paragraphNo = 1;
  present.forEach((page, index) => {
    const pageText = page.text.trim();
    // 页内段落：空行优先，否则按行（PDF mergePdfTextItems 以 \n 分行）
    const paragraphMatches = [...pageText.matchAll(/(.+?)(?:\n+|$)/gs)];
    for (const match of paragraphMatches) {
      const seg = match[0]!.replace(/\n+$/, '');
      if (!seg.trim()) continue;
      const segStart = match.index ?? 0;
      const start = cursor + segStart;
      blocks.push({
        charStart: start,
        charEnd: start + seg.length,
        pageNo: page.pageNo,
        paragraphNo,
      });
      paragraphNo += 1;
    }
    cursor += pageText.length;
    if (index < present.length - 1) cursor += 2; // '\n\n'
  });

  return { text, blocks };
}

/**
 * 非 PDF 文本（txt/md/Office）：规范化后按空行拆段，无页码。
 * 规范化 = CRLF→LF 后 trim（与 chunkText 同口径）。
 */
export function assemblePlainText(raw: string): StructuredText {
  const text = raw.replace(/\r\n/g, '\n').trim();
  const blocks: TextBlock[] = [];
  if (!text) return { text, blocks };

  let paragraphNo = 1;
  for (const match of text.matchAll(/(.+?)(?:\n{2,}|$)/gs)) {
    const seg = match[1]!;
    if (!seg.trim()) continue;
    const start = match.index ?? 0;
    blocks.push({
      charStart: start,
      charEnd: start + seg.length,
      pageNo: null,
      paragraphNo,
    });
    paragraphNo += 1;
  }
  return { text, blocks };
}

/** 单个分片的坐标结果；无法映射时页/段均为 null（不阻断落库） */
export interface ChunkCoordinate {
  pageNo: number | null;
  paragraphNo: number | null;
}

/**
 * 用分片首字符位置定位其所属源段落块：
 * 命中块区间直接返回；首字符落在块间隙（如页连接符）时回退到前一个块。
 */
function blockAtPosition(blocks: readonly TextBlock[], position: number): TextBlock | null {
  let fallback: TextBlock | null = null;
  for (const block of blocks) {
    if (position >= block.charStart && position < block.charEnd) return block;
    if (block.charStart <= position) fallback = block;
  }
  return fallback;
}

/**
 * 批量映射分片坐标。输入为 chunkText 的 slices（自带 charStart），
 * 输出顺序与输入一致。
 */
export function mapChunkCoordinates(
  slices: ReadonlyArray<{ charStart: number }>,
  blocks: readonly TextBlock[],
): ChunkCoordinate[] {
  return slices.map((slice) => {
    const block = blockAtPosition(blocks, slice.charStart);
    if (!block) return { pageNo: null, paragraphNo: null };
    return { pageNo: block.pageNo, paragraphNo: block.paragraphNo };
  });
}
