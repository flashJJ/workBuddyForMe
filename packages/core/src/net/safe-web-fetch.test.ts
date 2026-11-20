import { describe, expect, it } from 'vitest';
import { readBoundedText } from './safe-web-fetch';

/** GBK 编码的「你好」：你=C4E3，好=BAC3 */
const NIHAO_GBK = Uint8Array.from([0xc4, 0xe3, 0xba, 0xc3]);

function htmlResponse(bytes: Uint8Array, contentType: string): Response {
  return new Response(bytes, { headers: { 'content-type': contentType } });
}

function asciiPrefix(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const signal = () => new AbortController().signal;

describe('readBoundedText：中文站点字符集', () => {
  it('content-type 声明 gbk 时按 GBK 解码而非 UTF-8 乱码', async () => {
    const { html, truncated } = await readBoundedText(
      htmlResponse(NIHAO_GBK, 'text/html; charset=gbk'),
      signal(),
    );
    expect(html).toBe('你好');
    expect(truncated).toBe(false);
  });

  it('content-type 无 charset 时嗅探 <meta charset="gb2312">', async () => {
    const prefix = asciiPrefix('<html><head><meta charset="gb2312"></head><body>');
    const bytes = new Uint8Array(prefix.byteLength + NIHAO_GBK.byteLength);
    bytes.set(prefix, 0);
    bytes.set(NIHAO_GBK, prefix.byteLength);

    const { html } = await readBoundedText(htmlResponse(bytes, 'text/html'), signal());
    expect(html).toContain('你好');
  });

  it('UTF-8 页面保持原样（回归）', async () => {
    const bytes = new TextEncoder().encode('<p>你好</p>');
    const { html } = await readBoundedText(
      htmlResponse(bytes, 'text/html; charset=utf-8'),
      signal(),
    );
    expect(html).toBe('<p>你好</p>');
  });

  it('截断路径同样按声明字符集解码', async () => {
    const bytes = new TextEncoder().encode('你好，世界');
    const { html, truncated } = await readBoundedText(
      htmlResponse(bytes, 'text/html; charset=utf-8'),
      signal(),
      { maxBytes: 6, onOverflow: 'truncate' },
    );
    expect(truncated).toBe(true);
    expect(html.startsWith('你')).toBe(true);
  });
});
