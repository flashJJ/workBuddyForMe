import { ApiError } from '@wbfm/shared';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { DocumentKind } from './types';

const EXTENSION_KIND: Record<string, DocumentKind> = {
  '.txt': 'txt',
  '.md': 'md',
  '.markdown': 'md',
  '.pdf': 'pdf',
};

export function detectKind(filename: string): DocumentKind {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot === -1 ? '' : lower.slice(dot);
  const kind = EXTENSION_KIND[ext];
  if (!kind) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `不支持的文件类型：${ext || '无扩展名'}（仅支持 txt / md / pdf）`,
    );
  }
  return kind;
}

async function readPdf(data: Uint8Array): Promise<string> {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join('\n');
      pages.push(text.trim());
    }
    return pages.filter(Boolean).join('\n\n');
  } finally {
    await doc.destroy();
  }
}

/** 提取文档纯文本；txt/md 直读 UTF-8，pdf 走 pdfjs 本地解析（不上传外部） */
export async function readDocumentText(
  filename: string,
  data: Uint8Array,
): Promise<string> {
  const kind = detectKind(filename);
  if (kind === 'pdf') return readPdf(data);
  return new TextDecoder('utf-8').decode(data).replace(/^\uFEFF/, '');
}
