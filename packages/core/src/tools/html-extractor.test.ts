import { describe, expect, it } from 'vitest';
import {
  extractMainContent,
  extractPageOutline,
  extractPageTitle,
  htmlToText,
} from './html-extractor';

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

    it('无 article/main 且段落充足时优先段落，避免推荐位混入', () => {
      const paragraphs = `<p>${'这是一段真正的正文内容。'.repeat(30)}</p><p>第二段正文</p>`;
      const html = `<body><div>推荐阅读 热门文章 广告位 相关链接</div>${paragraphs}</body>`;
      const text = extractMainContent(html);
      expect(text).toContain('第二段正文');
      expect(text).not.toContain('推荐阅读');
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

  describe('v4.11 分层抓取辅助', () => {
    it('抽取 h1–h3 作为提纲，按层级缩进并去重', () => {
      const html =
        '<body><h1>总标题</h1><h2>第一节</h2><h3>细节</h3><h1>总标题</h1><footer><h2>页脚</h2></footer></body>';
      expect(extractPageOutline(html)).toEqual(['总标题', '  第一节', '    细节']);
    });

    it('页面标题去标签与实体', () => {
      expect(extractPageTitle('<title>示例 &amp; 文档</title>')).toBe('示例 & 文档');
      expect(extractPageTitle('<p>无标题</p>')).toBeNull();
    });
  });
});
