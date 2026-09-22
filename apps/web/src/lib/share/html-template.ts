import type { ConversationSnapshot, SharedPart } from '@wbfm/core';
import { formatDuration, formatTime } from './share-format';

/**
 * 对话快照 → 独立单文件 HTML（M2 分享）。
 * 内联 CSS、图片 data URL、零网络依赖，浏览器直接打开可阅读。
 * 正文做最小 markdown 渲染（围栏代码块 + 行内代码 + 段落），其余转义，杜绝 XSS。
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 行内代码（先转义再替换，避免代码内容被解析） */
function renderInline(text: string): string {
  return escapeHtml(text).replace(/`([^`\n]+)`/g, '<code>$1</code>');
}

/** 最小 markdown：围栏代码块 + 行内代码 + 空行分段 + 换行 */
function renderProse(markdown: string): string {
  const blocks: string[] = [];
  const fence = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(markdown)) !== null) {
    if (m.index > last) blocks.push(renderTextBlock(markdown.slice(last, m.index)));
    const lang = m[1] ? ` class="lang-${escapeHtml(m[1])}"` : '';
    blocks.push(`<pre><code${lang}>${escapeHtml(m[2]!.replace(/\n$/, ''))}</code></pre>`);
    last = fence.lastIndex;
  }
  if (last < markdown.length) blocks.push(renderTextBlock(markdown.slice(last)));
  return blocks.join('\n');
}

function renderTextBlock(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((para) => `<p>${renderInline(para).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function renderParts(parts: SharedPart[], fallbackContent: string): string {
  if (parts.length === 0) return renderProse(fallbackContent);
  return parts
    .map((p) =>
      p.type === 'text'
        ? renderProse(p.text)
        : `<figure><img src="${p.dataUrl}" alt="分享图片"></figure>`,
    )
    .join('\n');
}

const STYLES = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin:0; padding:32px 16px; background:#f4f5f7; color:#1a1d21;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  font-size:15px; line-height:1.7; }
.wrap { max-width:760px; margin:0 auto; }
header.doc { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:20px 24px; margin-bottom:20px; }
header.doc h1 { margin:0 0 8px; font-size:20px; }
header.doc .meta { color:#6b7280; font-size:13px; }
.msg { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:16px 20px; margin-bottom:14px; }
.msg.user { border-left:4px solid #4f8cff; }
.msg.assistant { border-left:4px solid #10b981; }
.role { font-size:13px; font-weight:600; color:#6b7280; margin-bottom:8px; }
.msg p { margin:0 0 10px; } .msg p:last-child { margin-bottom:0; }
pre { background:#0f172a; color:#e2e8f0; padding:14px 16px; border-radius:8px; overflow-x:auto;
  font-family:"Cascadia Code",Consolas,monospace; font-size:13px; line-height:1.5; margin:10px 0; }
code { font-family:"Cascadia Code",Consolas,monospace; font-size:13px; background:#eef1f5;
  padding:1px 5px; border-radius:4px; }
pre code { background:none; padding:0; }
figure { margin:10px 0; } figure img { max-width:100%; border-radius:8px; border:1px solid #e5e7eb; }
.tool { background:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #94a3b8;
  border-radius:8px; padding:10px 14px; margin:8px 0 12px; font-size:13px; }
.tool.ok { border-left-color:#10b981; } .tool.error { border-left-color:#ef4444; }
.tool .head { font-weight:600; } .tool .line { color:#475569; margin-top:2px; word-break:break-all; }
sup.cite a { text-decoration:none; background:#eaf1ff; color:#2563eb; border-radius:4px;
  padding:0 4px; margin:0 2px; font-size:12px; }
section.refs { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:16px 20px; margin-top:8px; }
section.refs h2 { font-size:15px; margin:0 0 10px; }
section.refs ol { margin:0; padding-left:20px; } section.refs li { margin-bottom:8px; font-size:13px; }
section.refs details { margin-top:4px; color:#4b5563; } section.refs a { color:#2563eb; }
footer.watermark { text-align:center; color:#9ca3af; font-size:12px; margin:24px 0 8px; }
`.trim();

export function renderConversationHtml(snap: ConversationSnapshot): string {
  const refMap = new Map<string, number>();
  const refs: Array<{ name: string; snippet?: string; sourceUrl?: string | null }> = [];
  const citeNo = (documentId: string, ordinal: number, name: string, snippet?: string, sourceUrl?: string | null): number => {
    const key = `${documentId}#${ordinal}`;
    const hit = refMap.get(key);
    if (hit !== undefined) return hit;
    const no = refs.length + 1;
    refMap.set(key, no);
    refs.push({ name, snippet, sourceUrl });
    return no;
  };

  const messageHtml = snap.messages
    .map((m) => {
      const roleCls = m.role === 'user' ? 'user' : 'assistant';
      const roleLabel = m.role === 'user' ? '🧑 用户' : '🤖 助手';
      const tools = m.toolTrace
        .map((t) => {
          const ok = t.status === 'ok';
          const verdict = ok ? '✅ 成功' : '❌ 失败';
          const detail =
            (t.argsSummary ? `<div class="line">参数：${escapeHtml(t.argsSummary)}</div>` : '') +
            (ok && t.resultSummary ? `<div class="line">结果：${escapeHtml(t.resultSummary)}</div>` : '') +
            (!ok && t.error ? `<div class="line">错误：${escapeHtml(t.error)}</div>` : '');
          return `<div class="tool ${ok ? 'ok' : 'error'}"><div class="head">🔧 ${escapeHtml(t.tool)} · ${formatDuration(t.durationMs)} → ${verdict}</div>${detail}</div>`;
        })
        .join('');
      const badges = m.citations
        .map((c) => {
          const no = citeNo(c.documentId, c.ordinal, c.documentName, c.snippet, c.sourceUrl);
          return `<sup class="cite"><a href="#cite-${no}">${no}</a></sup>`;
        })
        .join('');
      return `<section class="msg ${roleCls}"><div class="role">${roleLabel} · ${formatTime(m.createdAt)}</div>${tools}<div class="body">${renderParts(m.parts, m.content)}${badges}</div></section>`;
    })
    .join('\n');

  const refsHtml = refs.length
    ? `<section class="refs"><h2>引用来源（点击编号展开摘要）</h2><ol>${refs
        .map(
          (r, i) =>
            `<li id="cite-${i + 1}"><strong>${escapeHtml(r.name)}</strong>${
              r.snippet ? `<details><summary>查看摘要</summary>${escapeHtml(r.snippet)}</details>` : ''
            }${r.sourceUrl ? ` <a href="${escapeHtml(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">原文链接 ↗</a>` : ''}</li>`,
        )
        .join('')}</ol></section>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(snap.title)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">
<header class="doc">
  <h1>${escapeHtml(snap.title)}</h1>
  <div class="meta">助手：${escapeHtml(snap.assistantName ?? '通用助手')} · 导出时间：${formatTime(snap.exportedAt)}</div>
</header>
${messageHtml}
${refsHtml}
<footer class="watermark">由 WorkBuddy For Me v${escapeHtml(snap.appVersion)} 生成</footer>
</div>
</body>
</html>`;
}
