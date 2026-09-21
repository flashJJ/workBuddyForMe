import { unzipSync } from 'fflate';
import { ApiError } from '@wbfm/shared';
import { toOfficeReadError } from './office-error';

const SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/;

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 单页 slide XML：段落（a:p）换行，段内文本节点（a:t）顺序拼接 */
export function slideXmlToText(xml: string): string {
  return xml
    .split(/<a:p(?:\s[^>]*)?>/)
    .slice(1)
    .map((segment) => {
      const body = segment.split(/<\/a:p>/)[0] ?? segment;
      const runs = Array.from(body.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)).map(
        (match) => decodeXmlEntities(match[1] ?? ''),
      );
      return runs.join('').trim();
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * pptx → Markdown 风格纯文本：OOXML zip 解包后读取 ppt/slides/slideN.xml，
 * 每页一节（## 第 N 页）。不引入重型 Office 库，fflate 纯 JS 解包。
 */
export function readPptx(data: Uint8Array): string {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data);
  } catch (error) {
    throw toOfficeReadError('pptx', error);
  }

  const slides = Object.keys(entries)
    .map((path) => ({ path, index: SLIDE_PATH.exec(path)?.[1] }))
    .filter((item): item is { path: string; index: string } => Boolean(item.index))
    .sort((a, b) => Number(a.index) - Number(b.index));

  if (slides.length === 0) {
    throw ApiError.validation('pptx 文档解析失败：未找到任何幻灯片（可能已加密或不是有效 pptx）');
  }

  const sections: string[] = [];
  for (const slide of slides) {
    const xml = new TextDecoder('utf-8').decode(entries[slide.path]);
    const text = slideXmlToText(xml);
    if (text) sections.push(`## 第 ${slide.index} 页\n${text}`);
  }
  return sections.join('\n\n');
}
