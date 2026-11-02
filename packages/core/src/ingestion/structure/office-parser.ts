import { ApiError } from '@wbfm/shared/errors';
import { readDocxHtml } from '../office/read-docx';
import { parseTextDocument } from './text-parser';
import type { BlockSegment, DocumentTable, ParsedDocument } from './types';
import { assembleDocument } from './assembler';

const TABLE_CAPTION = /^(?:表|Table)\s*\d+/i;
const BLOCK_TOKEN = /<(h[1-6]|p|table|ul|ol)\b[^>]*>[\s\S]*?<\/\1>/gi;

function decodeHtml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<\/t[dh]>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
}

function parseTable(html: string): DocumentTable | null {
  const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).map((rowMatch) =>
    Array.from((rowMatch[1] ?? '').matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(
      (cellMatch) => htmlToText(cellMatch[1] ?? ''),
    ),
  );
  const nonEmpty = rows.filter((row) => row.length > 0 && row.some((cell) => cell.length > 0));
  if (nonEmpty.length === 0) return null;
  const header = nonEmpty.length >= 2 ? nonEmpty[0]! : [];
  const bodyRows = nonEmpty.length >= 2 ? nonEmpty.slice(1) : nonEmpty;
  return { tableNo: 0, header, rows: bodyRows };
}

/** DOCX HTML → 标题/段落/列表/表格（mammoth 已把标题样式映射为 h1-h6） */
export function buildDocxDocument(html: string, initialWarnings: readonly string[] = []): ParsedDocument {
  const segments: BlockSegment[] = [];
  for (const match of html.matchAll(BLOCK_TOKEN)) {
    const tag = (match[1] ?? '').toLowerCase();
    const outer = match[0];
    if (tag === 'table') {
      const table = parseTable(outer);
      if (!table) continue;
      const previous = segments[segments.length - 1];
      const caption =
        previous?.kind === 'paragraph' && TABLE_CAPTION.test(previous.content)
          ? previous.content
          : undefined;
      segments.push({
        kind: 'table',
        content: '',
        pageNo: null,
        table: { header: table.header, rows: table.rows, caption, pageNo: null },
      });
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(outer.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi))
        .map((item) => htmlToText(item[1] ?? ''))
        .filter(Boolean);
      if (items.length > 0) {
        segments.push({ kind: 'list', content: items.join('\n'), pageNo: null });
      }
      continue;
    }
    const content = htmlToText(outer);
    if (!content) continue;
    if (/^h[1-6]$/.test(tag)) {
      segments.push({
        kind: 'heading',
        content,
        pageNo: null,
        headingLevel: Number(tag.slice(1)),
      });
    } else {
      segments.push({ kind: 'paragraph', content, pageNo: null });
    }
  }
  return assembleDocument(segments, initialWarnings);
}

/** DOCX：解析 OOXML 包并保留标题/表格结构 */
export async function parseDocxDocument(data: Uint8Array): Promise<ParsedDocument> {
  return buildDocxDocument(await readDocxHtml(data));
}

/** PPTX/XLSX 已有文本层（`## 第 N 页` / `## Sheet` + 制表符行），按文本结构解析 */
export function parseOfficeText(text: string, initialWarnings: readonly string[] = []): ParsedDocument {
  if (!text.trim()) throw ApiError.validation('文档解析失败：没有可读取的文本内容');
  return parseTextDocument(text, initialWarnings);
}
