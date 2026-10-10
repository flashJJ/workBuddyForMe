import type { Language } from '@wbfm/shared/constants';
import type { ConversationSnapshot, SharedMessage } from '@wbfm/core/share';
import type { Citation } from '@wbfm/shared/types';
import { formatCitationMeta } from '../citation-meta';
import { formatDuration, formatTime } from './share-format';
import { createShareTranslator } from './share-i18n';

/**
 * 对话快照 → Markdown 字符串（M2 分享）。
 *
 * 约定：
 * - user/assistant 角色三级标题标注；
 * - 工具过程渲染为 blockquote 卡片（> 🔧 tool (2.3s) → 成功）；
 * - 引用角标渲染为标准脚注（[^n] + 文末脚注定义，含可点击原文链接）；
 * - 图片直接内联 data URL；代码块原样保留（LLM 输出本就是 markdown）。
 */

/** 取消息正文：优先多模态 parts，回落 content */
function messageBody(m: SharedMessage, imageAlt: string): string {
  if (m.parts.length === 0) return m.content;
  // imageAlt 由调用方传入（markdown 与 html 产物用词不同）
  return m.parts
    .map((p) => (p.type === 'text' ? p.text : `![${imageAlt}](${p.dataUrl})`))
    .join('\n\n');
}

interface Footnote {
  index: number;
  documentName: string;
  snippet?: string;
  sourceUrl?: string | null;
  /** 静态层标签（实体知识/文档要点），普通引用为空 */
  kindLabel: string;
  /** 页/段定位文本，无坐标为空 */
  location: string;
}

export function serializeMarkdown(
  snap: ConversationSnapshot,
  locale: Language = 'zh-CN',
): string {
  const tt = createShareTranslator(locale);
  const lines: string[] = [];
  const footnotes: Footnote[] = [];
  const footnoteKey = new Map<string, number>();

  const cite = (c: Citation): number => {
    const key = `${c.documentId}#${c.ordinal}`;
    const existing = footnoteKey.get(key);
    if (existing !== undefined) return existing;
    const idx = footnotes.length + 1;
    footnoteKey.set(key, idx);
    const meta = formatCitationMeta(c, tt);
    footnotes.push({
      index: idx,
      documentName: c.documentName,
      snippet: c.snippet,
      sourceUrl: c.sourceUrl,
      kindLabel: meta.kindLabel,
      location: meta.location,
    });
    return idx;
  };

  // 文档头
  lines.push(`# ${snap.title}`, '');
  lines.push(
    `- ${tt('share.headerAssistant', { name: snap.assistantName ?? tt('share.defaultAssistantName') })}`,
  );
  lines.push(`- ${tt('share.exportedAt', { time: formatTime(snap.exportedAt) })}`);
  lines.push('', '---', '');

  for (const m of snap.messages) {
    const roleTitle = m.role === 'user' ? tt('share.roleUser') : tt('share.roleAssistant');
    lines.push(`### ${roleTitle} · ${formatTime(m.createdAt)}`, '');

    // 工具过程卡片（助手消息；放在正文前，对应执行时序）
    for (const t of m.toolTrace) {
      const verdict = t.status === 'ok' ? tt('share.toolOk') : tt('share.toolFailed');
      lines.push(`> 🔧 **${t.tool}** (${formatDuration(t.durationMs)}) → ${verdict}`);
      if (t.argsSummary) lines.push(`> ${tt('share.argsLine', { text: t.argsSummary })}`);
      if (t.status === 'ok' && t.resultSummary) {
        lines.push(`> ${tt('share.resultLine', { text: t.resultSummary })}`);
      }
      if (t.status === 'error' && t.error) {
        lines.push(`> ${tt('share.errorLine', { text: t.error })}`);
      }
      lines.push('');
    }

    // 正文 + 引用角标
    let body = messageBody(m, tt('share.imageAltMarkdown')).trim();
    if (m.citations.length > 0) {
      const markers = m.citations.map((c) => `[^${cite(c)}]`).join(' ');
      body = `${body} ${markers}`;
    }
    lines.push(body || tt('share.noText'), '', '---', '');
  }

  // 脚注定义
  if (footnotes.length > 0) {
    lines.push(`## ${tt('share.refsTitleMarkdown')}`, '');
    for (const f of footnotes) {
      const title = f.kindLabel ? `${f.kindLabel}·${f.documentName}` : f.documentName;
      const parts: string[] = [`**${title}**`];
      if (f.location) parts.push(f.location);
      if (f.snippet) parts.push(f.snippet);
      if (f.sourceUrl) parts.push(`[${tt('share.sourceLinkMarkdown')}](${f.sourceUrl})`);
      lines.push(`[^${f.index}]: ${parts.join(' — ')}`);
    }
    lines.push('', '---', '');
  }

  // 水印
  lines.push(`*${tt('share.watermark', { version: snap.appVersion })}*`);
  return lines.join('\n');
}
