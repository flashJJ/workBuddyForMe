import { ApiError, OCR_TEXT_DENSITY_THRESHOLD } from '@wbfm/shared';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { DocumentKind } from './types';
import { readDocx } from './office/read-docx';
import { readXlsx } from './office/read-xlsx';
import { readPptx } from './office/read-pptx';
import { LEGACY_OFFICE_EXTENSIONS, rejectLegacyOffice } from './office/office-error';

const EXTENSION_KIND: Record<string, DocumentKind> = {
  '.txt': 'txt',
  '.md': 'md',
  '.markdown': 'md',
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.pptx': 'pptx',
};

export function detectKind(filename: string): DocumentKind {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot === -1 ? '' : lower.slice(dot);
  if (LEGACY_OFFICE_EXTENSIONS.includes(ext)) rejectLegacyOffice(ext);
  const kind = EXTENSION_KIND[ext];
  if (!kind) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `不支持的文件类型：${ext || '无扩展名'}（仅支持 txt / md / pdf / docx / xlsx / pptx）`,
    );
  }
  return kind;
}

/**
 * 合并 PDF TextItem 成有意义的行：
 * PDF 渲染器常把单行拆成多个 span（甚至逐字），相邻 span 的 y 坐标/字体相同
 * 就应拼接为同一行；否则换行。
 */
export function mergePdfTextItems(items: readonly unknown[]): string {
  const lines: string[] = [];
  let current: string[] = [];
  let prevY: number | null = null;
  let prevFontSize: number | null = null;
  const Y_TOLERANCE = 1.5; // PDF 坐标系单位一般是 pt，1.5 足够吸收 sub-pixel 抖动

  for (const raw of items) {
    const item = raw as { str?: string; transform?: number[] };
    if (!item.str) continue;
    // PDF 渲染器会在一些中文 PDF 的文字片段间插入 \u0001 控制符，过滤掉
    const str = item.str
      .split('\x01')
      .join('')
      .trim();
    if (!str) continue;

    const transform = item.transform ?? [1, 0, 0, 1, 0, 0];
    const y = transform[5] ?? 0;
    const fontSize = Math.abs(transform[3] ?? 1);

    const rowChanged =
      prevY !== null && Math.abs(y - prevY) > Y_TOLERANCE;
    const fontChanged =
      prevFontSize !== null && Math.abs(fontSize - prevFontSize) > 0.5 && current.length > 0;

    if (rowChanged || fontChanged) {
      lines.push(current.join('').trim());
      current = [];
    }
    current.push(str);
    prevY = y;
    prevFontSize = fontSize;
  }
  if (current.length > 0) lines.push(current.join('').trim());

  return lines
    .filter((l) => l.length > 0)
    .join('\n');
}

/**
 * v0.4：逐页提取 PDF 文字层（保留空页占位）。
 * 扫描件判定与「文字层页 / 待 OCR 页」混排合并都依赖逐页结果。
 */
export async function readPdfPageTexts(data: Uint8Array): Promise<string[]> {
  // pdfjs 在 Node fake-worker 下会 transfer（detach）输入缓冲，
  // 同一数据随后还要用于 OCR 渲染，这里必须传副本
  const doc = await pdfjs.getDocument({ data: data.slice(), isEvalSupported: false }).promise;
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(mergePdfTextItems(content.items).trim());
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}

async function readPdf(data: Uint8Array): Promise<string> {
  const pages = await readPdfPageTexts(data);
  return pages.filter(Boolean).join('\n\n');
}

/**
 * v0.4：文字层密度判定扫描件。
 * 平均每页非空白字符数 < 阈值（默认 50）即视为图片型 PDF；
 * 纯文字 PDF（即便有空白扉页）平均密度远高于阈值，不会误判。
 */
export function isImagePdf(
  pageTexts: readonly string[],
  threshold: number = OCR_TEXT_DENSITY_THRESHOLD,
): boolean {
  if (pageTexts.length === 0) return false;
  const total = pageTexts.reduce((sum, text) => sum + text.replace(/\s/g, '').length, 0);
  return total / pageTexts.length < threshold;
}

/** 单页是否需要 OCR：该页文字层非空白字符低于阈值 */
export function pageNeedsOcr(
  pageText: string,
  threshold: number = OCR_TEXT_DENSITY_THRESHOLD,
): boolean {
  return pageText.replace(/\s/g, '').length < threshold;
}

/**
 * 提取文档纯文本（全程本地，不上传外部）：
 * txt/md 直读 UTF-8，pdf 走 pdfjs 并合并跨行 text span，docx/xlsx/pptx 走纯 JS Office 解析器。
 */
export async function readDocumentText(
  filename: string,
  data: Uint8Array,
): Promise<string> {
  const kind = detectKind(filename);
  if (kind === 'pdf') return readPdf(data);
  if (kind === 'docx') return readDocx(data);
  if (kind === 'xlsx') return readXlsx(data);
  if (kind === 'pptx') return readPptx(data);
  return new TextDecoder('utf-8').decode(data).replace(/^\uFEFF/, '');
}
