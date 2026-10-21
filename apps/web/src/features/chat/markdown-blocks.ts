/**
 * v2.4 M5 / P1-4：长回复 Markdown 分块。
 * 仅在代码围栏外的顶级标题处切块——标题是天然的独立小节边界，
 * 不会破坏列表/表格/段落语义；代码围栏内的 `#` 不切。
 * 纯函数，join('\n') 必须与原文完全一致（无损）。
 */

/** 低于该长度走单块渲染，避免小消息产生额外组件开销 */
export const MARKDOWN_BLOCK_THRESHOLD = 1600;

export function splitMarkdownBlocks(content: string): string[] {
  const lines = content.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: '`' | '~' | null = null;

  const push = () => {
    if (current.length === 0) return;
    blocks.push(current.join('\n'));
    current = [];
  };

  for (const line of lines) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]![0] as '`' | '~';
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
    }
    const isHeading = fence === null && /^#{1,6}\s/.test(line);
    // 首个标题保留在首块内（前面通常还有引言），后续标题另起一块
    if (isHeading && current.some((item) => item.trim().length > 0)) push();
    current.push(line);
  }
  push();
  return blocks.length > 0 ? blocks : [content];
}
