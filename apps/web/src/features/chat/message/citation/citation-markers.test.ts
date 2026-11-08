import { describe, expect, it } from 'vitest';
import { linkifyCitationMarkers } from './citation-markers';

describe('linkifyCitationMarkers（v2.27）', () => {
  it('独立 [n] 与【n】转成来源锚点链接', () => {
    expect(linkifyCitationMarkers('结论[1]，另见【2】。')).toBe(
      '结论[1](#citation-1)，另见[2](#citation-2)。',
    );
  });

  it('行内代码与围栏代码块中的标记保持原样', () => {
    const source = '示例 `a[1]`\n\n```ts\nconst x = arr[0];\n```\n\n正文[2]';
    const output = linkifyCitationMarkers(source);
    expect(output).toContain('`a[1]`');
    expect(output).toContain('arr[0]');
    expect(output).toContain('[2](#citation-2)');
  });

  it('既有链接、图片与脚注定义不误伤', () => {
    const source = '[1](https://a.com) ![2](x.png) [1]: https://b.com';
    expect(linkifyCitationMarkers(source)).toBe(source);
  });

  it('无标记文本原样返回', () => {
    expect(linkifyCitationMarkers('普通段落，没有引用。')).toBe('普通段落，没有引用。');
  });
});
