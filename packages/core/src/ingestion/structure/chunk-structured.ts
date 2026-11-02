import { chunkText } from '../chunking';
import type { ChunkOptions, ChunkSlice } from '../types';
import { renderMarkdownTable } from './assembler';
import type { DocumentBlock, DocumentBlockKind, ParsedDocument } from './types';

export interface StructuredChunk extends ChunkSlice {
  pageNo: number | null;
  paragraphNo: number | null;
  sectionPath: string[];
  blockKind: DocumentBlockKind;
  tableNo: number | null;
  tableRowStart: number | null;
  tableRowEnd: number | null;
}

const PREFIX_MAX = 80;

/** 章节上下文前缀：最多 80 字符，超出截断；无章节时为空串 */
export function sectionPrefix(sectionPath: readonly string[]): string {
  const joined = sectionPath.filter(Boolean).join(' › ');
  if (!joined) return '';
  const text = joined.length <= PREFIX_MAX - 2 ? joined : `${joined.slice(0, PREFIX_MAX - 3)}…`;
  return `[${text}]`;
}

function blockAt(blocks: readonly DocumentBlock[], position: number): DocumentBlock | null {
  let fallback: DocumentBlock | null = null;
  for (const block of blocks) {
    if (position >= block.charStart && position < block.charEnd) return block;
    if (block.charStart <= position) fallback = block;
  }
  return fallback;
}

function emitTableChunks(
  block: DocumentBlock,
  paragraphNo: number,
  options: ChunkOptions,
  output: StructuredChunk[],
): void {
  const table = block.table!;
  const prefix = sectionPrefix(block.sectionPath);
  const withPrefix = (body: string) => (prefix ? `${prefix}\n\n${body}` : body);
  const base = {
    pageNo: block.pageNo,
    paragraphNo,
    sectionPath: block.sectionPath,
    blockKind: 'table' as const,
    tableNo: table.tableNo,
    charStart: block.charStart,
    charEnd: block.charEnd,
  };
  const full = withPrefix(renderMarkdownTable(table));
  if (full.length <= options.chunkSize || table.rows.length <= 1) {
    output.push({
      ...base,
      content: full,
      tableRowStart: table.rows.length > 0 ? 1 : null,
      tableRowEnd: table.rows.length > 0 ? table.rows.length : null,
    });
    return;
  }

  let group: string[][] = [];
  let groupStart = 1;
  const flush = () => {
    if (group.length === 0) return;
    output.push({
      ...base,
      content: withPrefix(renderMarkdownTable({ ...table, rows: group })),
      tableRowStart: groupStart,
      tableRowEnd: groupStart + group.length - 1,
    });
  };

  for (const row of table.rows) {
    group.push(row);
    const candidate = withPrefix(renderMarkdownTable({ ...table, rows: group }));
    if (candidate.length > options.chunkSize && group.length > 1) {
      group.pop();
      flush();
      groupStart += group.length;
      group = [row];
    }
  }
  flush();
}

/** 结构感知分块：表格原子化/超长按行切分，普通块沿用 chunkText，章节路径加轻量前缀 */
export function chunkDocument(parsed: ParsedDocument, options: ChunkOptions): StructuredChunk[] {
  const size = Math.max(50, Math.floor(options.chunkSize));
  const overlap = Math.min(Math.max(0, Math.floor(options.chunkOverlap)), size - 1);
  const normalizedOptions: ChunkOptions = { chunkSize: size, chunkOverlap: overlap };
  const chunks: StructuredChunk[] = [];
  const blockIndex = new Map(parsed.blocks.map((block, index) => [block, index]));
  let run: DocumentBlock[] = [];

  const flushRun = () => {
    if (run.length === 0) return;
    const runText = run.map((block) => block.content).join('\n\n');
    const runStart = run[0]!.charStart;
    for (const slice of chunkText(runText, normalizedOptions)) {
      const block = blockAt(parsed.blocks, runStart + slice.charStart) ?? run[0]!;
      const prefix = sectionPrefix(block.sectionPath);
      chunks.push({
        content: prefix ? `${prefix}\n\n${slice.content}` : slice.content,
        charStart: runStart + slice.charStart,
        charEnd: runStart + slice.charEnd,
        pageNo: block.pageNo,
        paragraphNo: (blockIndex.get(block) ?? 0) + 1,
        sectionPath: block.sectionPath,
        blockKind: block.kind,
        tableNo: null,
        tableRowStart: null,
        tableRowEnd: null,
      });
    }
    run = [];
  };

  for (const [index, block] of parsed.blocks.entries()) {
    if (block.kind === 'table' && block.table) {
      flushRun();
      emitTableChunks(block, index + 1, normalizedOptions, chunks);
      continue;
    }
    // 标题是章节边界：先收束上一节，避免跨章节合并导致首块路径丢失下级章节
    if (block.kind === 'heading') flushRun();
    run.push(block);
  }
  flushRun();

  if (chunks.length === 0 && parsed.text.trim()) {
    for (const slice of chunkText(parsed.text, normalizedOptions)) {
      chunks.push({
        ...slice,
        pageNo: null,
        paragraphNo: null,
        sectionPath: [],
        blockKind: 'paragraph',
        tableNo: null,
        tableRowStart: null,
        tableRowEnd: null,
      });
    }
  }
  return chunks;
}
