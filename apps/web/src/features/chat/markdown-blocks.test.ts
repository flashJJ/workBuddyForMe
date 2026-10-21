import { describe, expect, it } from 'vitest';
import { splitMarkdownBlocks } from './markdown-blocks';

describe('splitMarkdownBlocks（v2.4 P1-4 长回复分块）', () => {
  it('在顶级标题处切块，且首块保留引言', () => {
    const md = '引言\n\n## 一\n正文 A\n\n## 二\n正文 B';
    expect(splitMarkdownBlocks(md)).toEqual(['引言\n', '## 一\n正文 A\n', '## 二\n正文 B']);
  });

  it('代码围栏内的 # 不切块', () => {
    const md = '## 标题\n```ts\n# 注释\n## 也是注释\n```\n正文';
    expect(splitMarkdownBlocks(md)).toHaveLength(1);
  });

  it('代码围栏闭合后的标题仍可切块', () => {
    const md = '```\ncode\n```\n## 下一节\n正文';
    const blocks = splitMarkdownBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]!.startsWith('## 下一节')).toBe(true);
  });

  it('缩进的 # 不算标题（缩进代码/引用）', () => {
    const md = '正文\n    # 缩进代码\n  ## 引用内文本';
    expect(splitMarkdownBlocks(md)).toHaveLength(1);
  });

  it('无损：join 还原原文（含首尾空行）', () => {
    const md = '\n# 一\nA\n\n# 二\nB\n\n';
    expect(splitMarkdownBlocks(md).join('\n')).toBe(md);
  });

  it('空内容/纯空白返回单块', () => {
    expect(splitMarkdownBlocks('')).toEqual(['']);
    expect(splitMarkdownBlocks('\n\n')).toEqual(['\n\n']);
  });

  it('波浪线围栏同样受保护', () => {
    const md = '~~~\n## 不是标题\n~~~\n## 标题';
    const blocks = splitMarkdownBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toBe('## 标题');
  });

  it('≥5k 字长回复按小节切块且无损（长回复渲染优化入口）', () => {
    const section = (i: number) => `## 第 ${i} 节\n${'正文内容'.repeat(60)}\n`;
    const md = section(1) + Array.from({ length: 19 }, (_, i) => section(i + 2)).join('\n');
    expect(md.length).toBeGreaterThan(5000);
    const blocks = splitMarkdownBlocks(md);
    expect(blocks.length).toBeGreaterThanOrEqual(20);
    expect(blocks.join('\n')).toBe(md);
  });
});
