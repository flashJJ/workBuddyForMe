import mammoth from 'mammoth';
import { toOfficeReadError } from './office-error';

/**
 * docx → 结构化纯文本：段落保留换行；表格按行输出，单元格用 | 分隔。
 * mammoth 只产出受控的有限 HTML 标签，这里做轻量转换而非引入完整 DOM 依赖。
 */
export async function readDocx(data: Uint8Array): Promise<string> {
  try {
    const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(data) });
    return docxHtmlToText(html);
  } catch (error) {
    throw toOfficeReadError('docx', error);
  }
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

/** 受控 HTML → 文本：行（tr/p）换行，单元格 | 分隔，其余标签剥离 */
export function docxHtmlToText(html: string): string {
  return unescapeHtml(
    html
      // 单元格内的首/末段不产生换行，保证单元格单行输出
      .replace(/(<t[dh][^>]*>)\s*<p[^>]*>/gi, '$1')
      .replace(/<\/p>\s*(<\/t[dh]>)/gi, '$1')
      .replace(/<\/(p|h[1-6])>/gi, '\n')
      .replace(/<tr[^>]*>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' | ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((line) => line.replace(/\s+\|\s*$/g, '').trim())
    .filter(Boolean)
    .join('\n');
}
