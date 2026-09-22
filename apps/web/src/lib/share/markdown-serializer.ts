import type { ConversationSnapshot, SharedMessage } from '@wbfm/core';
import { formatDuration, formatTime } from './share-format';

/**
 * 对话快照 → Markdown 字符串（M2 分享）。
 *
 * 约定：
 * - user/assistant 角色三级标题标注；
 * - 工具过程渲染为 blockquote 卡片（> 🔧 tool (2.3s) → 成功）；
 * - 引用角标渲染为标准脚注（[^n] + 文末脚注定义，含可点击原文链接）；
 * - 图片直接内联 data URL；代码块原样保留（LLM 输出本就是 markdown）。
 */

const ROLE_TITLE: Record<SharedMessage['role'], string> = {
  user: '### 🧑 用户',
  assistant: '### 🤖 助手',
};

/** 取消息正文：优先多模态 parts，回落 content */
function messageBody(m: SharedMessage): string {
  if (m.parts.length === 0) return m.content;
  return m.parts
    .map((p) => (p.type === 'text' ? p.text : `![图片](${p.dataUrl})`))
    .join('\n\n');
}

interface Footnote {
  index: number;
  documentName: string;
  snippet?: string;
  sourceUrl?: string | null;
}

export function serializeMarkdown(snap: ConversationSnapshot): string {
  const lines: string[] = [];
  const footnotes: Footnote[] = [];
  const footnoteKey = new Map<string, number>();

  const cite = (c: { documentId: string; ordinal: number; documentName: string; snippet?: string; sourceUrl?: string | null }): number => {
    const key = `${c.documentId}#${c.ordinal}`;
    const existing = footnoteKey.get(key);
    if (existing !== undefined) return existing;
    const idx = footnotes.length + 1;
    footnoteKey.set(key, idx);
    footnotes.push({
      index: idx,
      documentName: c.documentName,
      snippet: c.snippet,
      sourceUrl: c.sourceUrl,
    });
    return idx;
  };

  // 文档头
  lines.push(`# ${snap.title}`, '');
  lines.push(`- 助手：${snap.assistantName ?? '通用助手'}`);
  lines.push(`- 导出时间：${formatTime(snap.exportedAt)}`);
  lines.push('', '---', '');

  for (const m of snap.messages) {
    lines.push(`${ROLE_TITLE[m.role]} · ${formatTime(m.createdAt)}`, '');

    // 工具过程卡片（助手消息；放在正文前，对应执行时序）
    for (const t of m.toolTrace) {
      const verdict = t.status === 'ok' ? '✅ 成功' : '❌ 失败';
      lines.push(`> 🔧 **${t.tool}** (${formatDuration(t.durationMs)}) → ${verdict}`);
      if (t.argsSummary) lines.push(`> 参数：${t.argsSummary}`);
      if (t.status === 'ok' && t.resultSummary) lines.push(`> 结果：${t.resultSummary}`);
      if (t.status === 'error' && t.error) lines.push(`> 错误：${t.error}`);
      lines.push('');
    }

    // 正文 + 引用角标
    let body = messageBody(m).trim();
    if (m.citations.length > 0) {
      const markers = m.citations.map((c) => `[^${cite(c)}]`).join(' ');
      body = `${body} ${markers}`;
    }
    lines.push(body || '（无文本内容）', '', '---', '');
  }

  // 脚注定义
  if (footnotes.length > 0) {
    lines.push('## 引用来源', '');
    for (const f of footnotes) {
      const parts: string[] = [`**${f.documentName}**`];
      if (f.snippet) parts.push(f.snippet);
      if (f.sourceUrl) parts.push(`[原文链接](${f.sourceUrl})`);
      lines.push(`[^${f.index}]: ${parts.join(' — ')}`);
    }
    lines.push('', '---', '');
  }

  // 水印
  lines.push(`*由 WorkBuddy For Me v${snap.appVersion} 生成*`);
  return lines.join('\n');
}
