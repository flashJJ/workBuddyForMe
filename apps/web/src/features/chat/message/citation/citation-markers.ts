/**
 * v2.27：正文引用角标解析（纯函数）
 *
 * 约定：把独立的 `[n]` 与 `【n】` 转成指向来源卡的链接 `[n](#citation-n)`，
 * 渲染层据此替换为可点击角标；跳过围栏代码块、行内代码、链接与图片语法，
 * 避免误伤示例代码与既有 Markdown 结构。
 */
export const CITATION_FOCUS_EVENT = 'wbfm:citation-focus';

/** 来源卡锚点选择器（用 data 属性而非 id，避免多条消息重复编号） */
export function citationAnchorSelector(index: number): string {
  return `[data-cite-index="${index}"]`;
}

const FENCE_RE = /^\s*(```|~~~)/;
const MARKER_RE = /^\[(\d{1,3})\]/;
const CJK_MARKER_RE = /^【(\d{1,3})】/;

/** 单行内联解析：代码、链接、图片保持原样，独立编号转成角标链接 */
function linkifyInline(line: string): string {
  let output = '';
  let cursor = 0;
  while (cursor < line.length) {
    const char = line[cursor]!;
    if (char === '`') {
      const end = line.indexOf('`', cursor + 1);
      const stop = end === -1 ? line.length : end + 1;
      output += line.slice(cursor, stop);
      cursor = stop;
      continue;
    }
    if (char === '[') {
      // 既有链接/图片：整段跳过（含 ![](...) 与 [text](url)）
      const close = line.indexOf(']', cursor + 1);
      if (close !== -1 && line[close + 1] === '(') {
        const paren = line.indexOf(')', close + 2);
        const stop = paren === -1 ? close + 1 : paren + 1;
        output += line.slice(cursor, stop);
        cursor = stop;
        continue;
      }
      const match = MARKER_RE.exec(line.slice(cursor));
      const next = match ? line[cursor + match[0].length] : undefined;
      // `[n](` 是链接文本、`[n]:` 是脚注定义，都不是引用角标
      if (match && next !== '(' && next !== ':') {
        output += `[${match[1]}](#citation-${match[1]})`;
        cursor += match[0].length;
        continue;
      }
    }
    if (char === '【') {
      const match = CJK_MARKER_RE.exec(line.slice(cursor));
      if (match) {
        output += `[${match[1]}](#citation-${match[1]})`;
        cursor += match[0].length;
        continue;
      }
    }
    output += char;
    cursor += 1;
  }
  return output;
}

/** 逐行处理并跟踪围栏代码块状态（围栏内的 `[n]` 一律不转换） */
export function linkifyCitationMarkers(source: string): string {
  if (!source.includes('[') && !source.includes('【')) return source;
  let inFence = false;
  return source
    .split('\n')
    .map((line) => {
      if (FENCE_RE.test(line)) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : linkifyInline(line);
    })
    .join('\n');
}
