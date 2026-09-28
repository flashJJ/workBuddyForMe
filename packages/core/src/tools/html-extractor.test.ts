import { describe, expect, it } from 'vitest';
import { extractMainContent, htmlToText } from './html-extractor';

describe('html-extractor', () => {
  describe('htmlToText', () => {
    it('剥脚本/标签、解码实体、块级换行', () => {
      const html =
        '<html><head><style>x{}</style><script>alert(1)</script></head>' +
        '<body><h1>标题</h1><p>正文&nbsp;A &amp; B</p>' +
        '<a href="x">链接</a></body></html>';
      const text = htmlToText(html);
      expect(text).toContain('标题');
      expect(text).toContain('正文 A & B');
      expect(text).toContain('链接');
      expect(text).not.toContain('alert');
      expect(text).not.toContain('<');
    });

    it('空串与纯空白返回空串', () => {
      expect(htmlToText('')).toBe('');
      expect(htmlToText('   \n  ')).toBe('');
    });
  });

  describe('extractMainContent', () => {
    it('剥 nav/aside/footer/header 噪声，保留 article 正文', () => {
      const html =
        '<html><head><title>T</title></head><body>' +
        '<nav>菜单 A B</nav>' +
        '<header>顶栏</header>' +
        '<article><h1>正文标题</h1><p>正文段落</p></article>' +
        '<aside>侧边推荐</aside>' +
        '<footer>版权</footer>' +
        '</body></html>';
      const text = extractMainContent(html);
      expect(text).toContain('正文标题');
      expect(text).toContain('正文段落');
      expect(text).not.toContain('菜单');
      expect(text).not.toContain('顶栏');
      expect(text).not.toContain('侧边推荐');
      expect(text).not.toContain('版权');
    });

    it('无 article 时取 main 块', () => {
      const html = '<body><nav>菜单</nav><main><p>主内容</p></main></body>';
      const text = extractMainContent(html);
      expect(text).toContain('主内容');
      expect(text).not.toContain('菜单');
    });

    it('无 article/main 时回退 body（仍剥噪声）', () => {
      const html = '<body><nav>菜单</nav><p>普通段落</p></body>';
      const text = extractMainContent(html);
      expect(text).toContain('普通段落');
      expect(text).not.toContain('菜单');
    });

    it('多个 article 块拼接（博客列表页）', () => {
      const html =
        '<body>' +
        '<article><p>第一篇</p></article>' +
        '<article><p>第二篇</p></article>' +
        '</body>';
      const text = extractMainContent(html);
      expect(text).toContain('第一篇');
      expect(text).toContain('第二篇');
    });

    it('script/style/noscript/iframe 内容被整体剥离', () => {
      const html =
        '<body>' +
        '<article><p>正文</p></article>' +
        '<script>var x = 1;</script>' +
        '<style>.a { color: red; }</style>' +
        '<noscript>请启用 JS</noscript>' +
        '<iframe src="ad.html">广告</iframe>' +
        '</body>';
      const text = extractMainContent(html);
      expect(text).toBe('正文');
      expect(text).not.toContain('var x');
      expect(text).not.toContain('color');
      expect(text).not.toContain('JS');
      expect(text).not.toContain('广告');
    });

    it('HTML 注释被剥离', () => {
      const html = '<body><article><!-- 隐藏说明 --><p>正文</p></article></body>';
      const text = extractMainContent(html);
      expect(text).toBe('正文');
      expect(text).not.toContain('隐藏说明');
    });

    it('空 html 返回空串', () => {
      expect(extractMainContent('')).toBe('');
    });

    it('无任何正文块时回退整段清洗', () => {
      const html = '<p>散落文本</p><div>另一段</div>';
      const text = extractMainContent(html);
      expect(text).toContain('散落文本');
      expect(text).toContain('另一段');
    });
  });
});
