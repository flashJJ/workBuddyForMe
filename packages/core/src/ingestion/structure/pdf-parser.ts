import type { PdfPageItems } from '../read-document';
import { assembleDocument } from './assembler';
import type { BlockSegment, ParsedDocument } from './types';

interface PositionedItem {
  str: string;
  x: number;
  y: number;
  fontSize: number;
  width: number;
}

interface PdfLine {
  text: string;
  cells: string[];
  fontSize: number;
  y: number;
}

const Y_TOLERANCE = 1.5;
const FONT_TOLERANCE = 0.5;
const TABLE_CAPTION = /^(?:表|Table)\s*\d+/i;
const FIGURE_CAPTION = /^(?:图|Figure|圖)\s*\d+/i;
const BULLET = /^(?:[•·▪]|[-*])\s+/;
const NUMBERED_ITEM = /^(?:\(?\d+[.)、]|[（(][一二三四五六七八九十0-9]+[）)])\s*/;

function readItem(raw: unknown): PositionedItem | null {
  const item = raw as {
    str?: string;
    transform?: number[];
    width?: number;
  };
  if (!item.str) return null;
  const str = item.str.split('\x01').join('').trim();
  if (!str) return null;
  const transform = item.transform ?? [1, 0, 0, 1, 0, 0];
  return {
    str,
    x: transform[4] ?? 0,
    y: transform[5] ?? 0,
    fontSize: Math.abs(transform[3] ?? 1) || 1,
    width: typeof item.width === 'number' ? item.width : str.length * 0.6 * Math.abs(transform[3] ?? 1),
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

/** 把同一行内按 x 间距拆成单元格；间距明显大于字高视为独立列 */
function splitCells(items: PositionedItem[], fontSize: number): string[] {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const cellGap = Math.max(12, fontSize * 1.5);
  const cells: string[] = [];
  let current = '';
  let lastEnd: number | null = null;

  for (const item of sorted) {
    if (lastEnd !== null && item.x - lastEnd > cellGap && current.trim()) {
      cells.push(current.trim());
      current = '';
    }
    current += item.str;
    lastEnd = item.x + item.width;
  }
  if (current.trim()) cells.push(current.trim());
  return cells;
}

/** 按 y/字号把 TextItem 合并成行；与 read-document 的旧合并规则一致，额外保留列切分 */
export function buildPdfLines(rawItems: readonly unknown[]): PdfLine[] {
  const items = rawItems
    .map(readItem)
    .filter((item): item is PositionedItem => item !== null);
  const lines: PdfLine[] = [];
  let current: PositionedItem[] = [];
  let prevY: number | null = null;
  let prevFontSize: number | null = null;

  const flush = () => {
    if (current.length === 0) return;
    const fontSize = Math.max(...current.map((item) => item.fontSize));
    const cells = splitCells(current, fontSize);
    const text = cells.join(' ');
    if (text.trim()) lines.push({ text: text.trim(), cells, fontSize, y: prevY ?? 0 });
    current = [];
  };

  for (const item of items) {
    const rowChanged = prevY !== null && Math.abs(item.y - prevY) > Y_TOLERANCE;
    const fontChanged =
      prevFontSize !== null &&
      Math.abs(item.fontSize - prevFontSize) > FONT_TOLERANCE &&
      current.length > 0;
    if (rowChanged || fontChanged) flush();
    current.push(item);
    prevY = item.y;
    prevFontSize = item.fontSize;
  }
  flush();
  return lines;
}

function numberedHeadingLevel(
  text: string,
  fontSize: number,
  bodyFontSize: number,
): number | null {
  if (text.length > 60 || /[。！？；]$/.test(text)) return null;
  if (/^第[一二三四五六七八九十百0-9]+[章节篇部分]/.test(text)) return 1;
  if (fontSize <= bodyFontSize * 1.15) return null;
  if (/^[一二三四五六七八九十]+、/.test(text)) return 2;
  if (/^\d+\.\d+/.test(text)) return 3;
  if (/^\d+[、.]/.test(text)) return 2;
  return null;
}

function isTableLine(line: PdfLine): boolean {
  return line.cells.length >= 2;
}

/** 单页结构：标题/列表/表格/段落/图注，表格按连续多列行启发式识别 */
function buildPageSegments(page: PdfPageItems, bodyFontSize: number): {
  segments: BlockSegment[];
  warnings: string[];
} {
  const lines = buildPdfLines(page.items);
  const warnings: string[] = [];
  const segments: BlockSegment[] = [];
  const headingSizes = [...new Set(
    lines
      .filter((line) => line.cells.length === 1 && line.text.length <= 80 && line.fontSize > bodyFontSize * 1.15)
      .map((line) => line.fontSize),
  )].sort((a, b) => b - a);
  const headingLevel = (fontSize: number) => {
    const found = headingSizes.findIndex((size) => Math.abs(size - fontSize) < FONT_TOLERANCE);
    return found >= 0 ? Math.min(found + 1, 4) : 1;
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.text.trim()) {
      index += 1;
      continue;
    }

    if (!isTableLine(line)) {
      const numbered = numberedHeadingLevel(line.text, line.fontSize, bodyFontSize);
      const sizeHeading = line.text.length <= 80 && line.fontSize > bodyFontSize * 1.15;
      if (numbered !== null || sizeHeading) {
        segments.push({
          kind: 'heading',
          content: line.text,
          pageNo: page.pageNo,
          headingLevel: numbered ?? headingLevel(line.fontSize),
        });
        index += 1;
        continue;
      }
    }

    if (isTableLine(line)) {
      const rows: string[][] = [];
      const start = index;
      while (index < lines.length && isTableLine(lines[index]!)) {
        rows.push(lines[index]!.cells);
        index += 1;
      }
      if (rows.length >= 2) {
        const columnCount = rows[0]!.length;
        const mismatch = rows.findIndex((row) => row.length !== columnCount);
        if (mismatch >= 0) {
          warnings.push(
            `PDF 第 ${page.pageNo} 页表格第 ${mismatch + 1} 行单元格数与表头不一致`,
          );
        }
        if (rows.length >= 4 && columnCount === 2) {
          warnings.push(`PDF 第 ${page.pageNo} 页疑似多栏排版，表格/章节识别可能不准确`);
        }
        const previous = segments[segments.length - 1];
        const caption =
          previous?.kind === 'paragraph' && TABLE_CAPTION.test(previous.content)
            ? previous.content
            : undefined;
        segments.push({
          kind: 'table',
          content: '',
          pageNo: page.pageNo,
          table: {
            header: rows[0]!,
            rows: rows.slice(1),
            caption,
            pageNo: page.pageNo,
          },
        });
        continue;
      }
      // 多列行不足两行时按普通段落回退，避免把单行公式/目录误判为表格
      index = start;
    }

    if (BULLET.test(line.text) || NUMBERED_ITEM.test(line.text)) {
      const items: string[] = [];
      while (
        index < lines.length &&
        (BULLET.test(lines[index]!.text) || NUMBERED_ITEM.test(lines[index]!.text))
      ) {
        items.push(lines[index]!.text.trim());
        index += 1;
      }
      segments.push({ kind: 'list', content: items.join('\n'), pageNo: page.pageNo });
      continue;
    }

    if (FIGURE_CAPTION.test(line.text)) {
      segments.push({ kind: 'figure', content: line.text.trim(), pageNo: page.pageNo });
      index += 1;
      continue;
    }

    const paragraph: string[] = [line.text.trim()];
    index += 1;
    while (index < lines.length) {
      const next = lines[index]!;
      if (
        isTableLine(next) ||
        BULLET.test(next.text) ||
        NUMBERED_ITEM.test(next.text) ||
        FIGURE_CAPTION.test(next.text) ||
        TABLE_CAPTION.test(next.text) ||
        numberedHeadingLevel(next.text, next.fontSize, bodyFontSize) !== null ||
        (next.text.length <= 80 && next.fontSize > bodyFontSize * 1.15)
      ) {
        break;
      }
      paragraph.push(next.text.trim());
      index += 1;
    }
    segments.push({ kind: 'paragraph', content: paragraph.join('\n'), pageNo: page.pageNo });
  }

  return { segments, warnings };
}

/** 文字层 PDF 结构解析：页 → 章节/段落/列表/表格/图注 */
export function buildPdfDocument(
  pages: readonly PdfPageItems[],
  initialWarnings: readonly string[] = [],
): ParsedDocument {
  const allLines = pages.flatMap((page) => buildPdfLines(page.items));
  const bodyFontSize = median(allLines.map((line) => line.fontSize)) || 12;
  const segments: BlockSegment[] = [];
  const warnings = [...initialWarnings];
  for (const page of pages) {
    const built = buildPageSegments(page, bodyFontSize);
    segments.push(...built.segments);
    warnings.push(...built.warnings);
  }
  return assembleDocument(segments, warnings);
}
