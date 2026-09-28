/**
 * 极简 HTML 正文抽取（v0.6 M4）：纯手写启发式，避免引入 jsdom/readability 撑爆打包体积。
 *
 * 两段式策略：
 * 1. 剥离噪声块（nav/aside/footer/header/script/style/iframe/noscript 与 HTML 注释）；
 * 2. 优先取 article → main → body 的第一个非空块；都不命中时回退到整段清洗结果。
 *
 * 失败回退到 htmlToText，保证至少返回可读纯文本。
 */
const NOISE_TAGS = ['script', 'style', 'noscript', 'iframe', 'nav', 'aside', 'footer', 'header'];

/** 极简 HTML→纯文本：去脚本样式标签 → 剥标签 → 解码常见实体；不引第三方依赖 */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>(?!\n)/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
}

/** 删除指定标签块（含内容），忽略大小写；用于剥离 nav/footer 等噪声区域 */
function stripTagBlocks(html: string, tags: string[]): string {
  let result = html;
  for (const tag of tags) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    result = result.replace(re, '');
  }
  return result;
}

/** 收集指定标签的全部内层 HTML（多个同标签拼接） */
function collectBlocks(html: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let combined = '';
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    combined += `${match[1]}\n`;
  }
  return combined;
}

/** 选取正文块：article → main → body → 整段清洗结果 */
function pickMainBlock(cleaned: string): string {
  const article = collectBlocks(cleaned, 'article');
  if (article) return article;
  const main = collectBlocks(cleaned, 'main');
  if (main) return main;
  const body = collectBlocks(cleaned, 'body');
  return body || cleaned;
}

/** 抽取网页正文：剥噪声 → 选正文块 → 转纯文本；正文块抽空则回退到整段清洗 */
export function extractMainContent(html: string): string {
  const cleaned = stripTagBlocks(html, NOISE_TAGS).replace(/<!--[\s\S]*?-->/g, '');
  const block = pickMainBlock(cleaned);
  const text = htmlToText(block);
  if (text) return text;
  return htmlToText(cleaned);
}
