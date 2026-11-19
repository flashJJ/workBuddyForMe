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

/** 选取正文块：article → main → body（优先段落）→ 整段清洗结果 */
function pickMainBlock(cleaned: string): string {
  const article = collectBlocks(cleaned, 'article');
  if (article) return article;
  const main = collectBlocks(cleaned, 'main');
  if (main) return main;
  const body = collectBlocks(cleaned, 'body');
  if (body) {
    // 语义标签缺失时，正文通常由 <p> 承载；导航/推荐位多为链接与短 div。
    // 段落总长足够时优先段落，避免把整页推荐位混进“正文”。
    const paragraphs = collectBlocks(body, 'p');
    if (paragraphs.replace(/\s+/g, '').length >= 200) return paragraphs;
  }
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

/** 页面标题：<title> 去标签与实体，超长截断 */
export function extractPageTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match?.[1]) return null;
  const text = htmlToText(`<p>${match[1]}</p>`).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 160) : null;
}

const OUTLINE_MAX_ITEMS = 12;
const OUTLINE_MAX_LABEL = 120;

/**
 * v4.11 分层抓取：抽取 h1–h3 作为页面提纲，帮助模型决定读哪一段，
 * 不必把整页正文一次塞进上下文。
 */
export function extractPageOutline(html: string, limit = OUTLINE_MAX_ITEMS): string[] {
  const cleaned = stripTagBlocks(html, NOISE_TAGS);
  const re = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const seen = new Set<string>();
  const items: string[] = [];
  let match: RegExpExecArray | null;
  while (items.length < limit && (match = re.exec(cleaned)) !== null) {
    const text = htmlToText(`<p>${match[2]}</p>`).replace(/\s+/g, ' ').trim();
    if (text.length < 2 || text.length > OUTLINE_MAX_LABEL || seen.has(text)) continue;
    seen.add(text);
    const indent = '  '.repeat(Number(match[1]) - 1);
    items.push(`${indent}${text}`);
  }
  return items;
}
