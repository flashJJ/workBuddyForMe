import type { Citation, ToolTraceEntry } from '@wbfm/shared';

/**
 * 对话分享快照（M2）：core 从 DB + 附件文件构建的与会话存储无关的中间结构。
 * web 层的 markdown/html serializer 只消费此结构，不直接碰 DB。
 */

/** 已解析为 data URL 的图片片段（分享文件零外部依赖） */
export type SharedPart =
  | { type: 'text'; text: string }
  | { type: 'image'; dataUrl: string };

export interface SharedMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  /** 多模态片段（老消息为空数组，回落 content） */
  parts: SharedPart[];
  toolTrace: ToolTraceEntry[];
  citations: Citation[];
}

export interface ConversationSnapshot {
  conversationId: string;
  title: string;
  assistantName: string | null;
  exportedAt: string;
  appVersion: string;
  messages: SharedMessage[];
}

/** 脱敏占位 */
export const REDACTED = '[REDACTED]';

/**
 * 分享文本脱敏（纯函数）：
 * 1. 数据根目录路径 / ~/.workbuddy-for-me 本地路径 → [REDACTED]
 * 2. sk-xxx 风格 API Key → [REDACTED]
 * 3. Bearer/Authorization 令牌 → [REDACTED]
 * 4. api_key/token/secret/password 赋值串 → [REDACTED]
 */
export function sanitizeShareText(input: string, dataRoot?: string): string {
  let out = input;

  // 1a. 具体数据根路径（先长后短，避免前缀替换残留）
  if (dataRoot) {
    const variants = [dataRoot, dataRoot.replace(/\\/g, '/'), dataRoot.replace(/\//g, '\\')];
    for (const v of [...new Set(variants)].sort((a, b) => b.length - a.length)) {
      out = out.split(v).join(REDACTED);
    }
  }
  // 1b. 任意用户目录下的 .workbuddy-for-me 路径（Win/macOS Linux/波浪号）
  out = out.replace(
    /[A-Za-z]:\\[^\s"'<>|*?]*\.workbuddy-for-me(?:\\[^\s"'<>|*?]*)?/g,
    REDACTED,
  );
  out = out.replace(/\/(?:home|Users)\/[^\s"'<>|*?]+\/\.workbuddy-for-me(?:\/[^\s"'<>|*?]*)?/g, REDACTED);
  out = out.replace(/~\/\.workbuddy-for-me(?:\/[^\s"'<>|*?]*)?/g, REDACTED);

  // 2. OpenAI 风格 sk- key（含 sk-ant-、sk-or- 等前缀）
  out = out.replace(/sk-[A-Za-z0-9_-]{12,}/g, REDACTED);

  // 3. Bearer / Basic 令牌
  out = out.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/g, `$1 ${REDACTED}`);

  // 4. key/token/secret/password 赋值（JSON、env、header 常见形态）
  out = out.replace(
    /\b(api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password)("?\s*[:=]\s*"?)[^\s"',;}]{6,}/gi,
    `$1$2${REDACTED}`,
  );

  return out;
}

/** 对快照内所有文本字段做脱敏（content / parts / 工具轨迹） */
export function sanitizeSnapshot(snapshot: ConversationSnapshot, dataRoot?: string): ConversationSnapshot {
  const scrub = (s: string) => sanitizeShareText(s, dataRoot);
  return {
    ...snapshot,
    title: scrub(snapshot.title),
    messages: snapshot.messages.map((m) => ({
      ...m,
      content: scrub(m.content),
      parts: m.parts.map((p) => (p.type === 'text' ? { type: 'text', text: scrub(p.text) } : p)),
      toolTrace: m.toolTrace.map((t) => ({
        ...t,
        argsSummary: scrub(t.argsSummary),
        resultSummary: scrub(t.resultSummary),
        error: t.error ? scrub(t.error) : undefined,
      })),
      citations: m.citations.map((c) => ({
        ...c,
        documentName: scrub(c.documentName),
        snippet: c.snippet ? scrub(c.snippet) : undefined,
        sourceUrl: c.sourceUrl ? scrub(c.sourceUrl) : undefined,
      })),
    })),
  };
}
