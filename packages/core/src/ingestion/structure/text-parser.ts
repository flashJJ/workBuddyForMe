import { assembleDocument } from './assembler';
import type { BlockSegment, ParsedDocument } from './types';

const HEADING = /^(#{1,6})\s+(.+?)\s*#*$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)、])\s+/;
const FIGURE_CAPTION = /^(?:图|Figure|圖)\s*\d+/i;
const TABLE_CAPTION = /^(?:表|Table)\s*\d+/i;
const PAGE_HEADING = /^第\s*(\d+)\s*页$/;
const TABLE_SEPARATOR = /^\s*\|?[\s:|-]+\|?\s*$/;

function isTableRow(line: string): boolean {
  if (line.includes('\t')) return line.split('\t').filter((cell) => cell.trim()).length >= 2;
  if (!line.includes('|')) return false;
  const cells = splitPipeRow(line);
  return cells !== null && cells.length >= 2;
}

function splitPipeRow(line: string): string[] | null {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = trimmed.split('|').map((cell) => cell.trim());
  return cells.length >= 2 ? cells : null;
}

function splitTableRow(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((cell) => cell.trim());
  return splitPipeRow(line) ?? [line.trim()];
}

interface ParsedLine {
  text: string;
  blank: boolean;
}

function toLines(text: string): ParsedLine[] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => ({ text: line.trimEnd(), blank: line.trim().length === 0 }));
}

/** 在一段连续文本内识别标题/列表/表格/段落，页码由调用方固定或按 `第 N 页` 标题推导 */
function buildSegments(text: string, fixedPageNo: number | null): BlockSegment[] {
  const lines = toLines(text);
  const segments: BlockSegment[] = [];
  let currentPageNo = fixedPageNo;
  let index = 0;

  const pushParagraph = (content: string, pageNo: number | null) => {
    const trimmed = content.trim();
    if (trimmed) segments.push({ kind: 'paragraph', content: trimmed, pageNo });
  };

  while (index < lines.length) {
    const line = lines[index]!;
    if (line.blank) {
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line.text);
    if (heading) {
      const title = heading[2]!.trim();
      const pageMatch = PAGE_HEADING.exec(title);
      if (pageMatch) currentPageNo = Number(pageMatch[1]);
      segments.push({
        kind: 'heading',
        content: title,
        pageNo: currentPageNo,
        headingLevel: heading[1]!.length,
      });
      index += 1;
      continue;
    }

    if (isTableRow(line.text)) {
      const rows: string[][] = [];
      const start = index;
      while (index < lines.length && !lines[index]!.blank && isTableRow(lines[index]!.text)) {
        const raw = lines[index]!.text;
        if (!TABLE_SEPARATOR.test(raw)) rows.push(splitTableRow(raw));
        index += 1;
      }
      const previous = segments[segments.length - 1];
      const caption =
        previous?.kind === 'paragraph' && TABLE_CAPTION.test(previous.content)
          ? previous.content
          : undefined;
      const header = rows.length >= 2 ? rows[0]! : [];
      const bodyRows = rows.length >= 2 ? rows.slice(1) : rows;
      segments.push({
        kind: 'table',
        content: '',
        pageNo: currentPageNo,
        table: { header, rows: bodyRows, caption, pageNo: currentPageNo },
      });
      if (index === start) index += 1;
      continue;
    }

    if (LIST_ITEM.test(line.text)) {
      const items: string[] = [];
      while (index < lines.length && !lines[index]!.blank && LIST_ITEM.test(lines[index]!.text)) {
        items.push(lines[index]!.text.trim());
        index += 1;
      }
      segments.push({ kind: 'list', content: items.join('\n'), pageNo: currentPageNo });
      continue;
    }

    if (FIGURE_CAPTION.test(line.text)) {
      segments.push({ kind: 'figure', content: line.text.trim(), pageNo: currentPageNo });
      index += 1;
      continue;
    }

    const paragraph: string[] = [line.text.trim()];
    index += 1;
    while (index < lines.length) {
      const next = lines[index]!;
      if (
        next.blank ||
        HEADING.test(next.text) ||
        isTableRow(next.text) ||
        LIST_ITEM.test(next.text) ||
        FIGURE_CAPTION.test(next.text)
      ) {
        break;
      }
      paragraph.push(next.text.trim());
      index += 1;
    }
    pushParagraph(paragraph.join('\n'), currentPageNo);
  }

  return segments;
}

/** txt/md 与 Office 纯文本（PPTX 章节、XLSX 工作表）结构解析 */
export function parseTextDocument(
  raw: string,
  initialWarnings: readonly string[] = [],
): ParsedDocument {
  return assembleDocument(buildSegments(raw, null), initialWarnings);
}

/** OCR 等逐页文本：页面边界固定，页内按文本行/表格启发式重建 */
export function parsePagedTextDocument(
  pages: ReadonlyArray<{ pageNo: number; text: string }>,
  initialWarnings: readonly string[] = [],
): ParsedDocument {
  const segments = pages.flatMap((page) => buildSegments(page.text, page.pageNo));
  return assembleDocument(segments, initialWarnings);
}
