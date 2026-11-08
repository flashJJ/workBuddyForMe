/**
 * v2.25：PTT 识别文本与输入框草稿的纯函数。
 * 识别结果只追加/替换文本，绝不覆盖用户已输入内容。
 */

/** 追加识别文本：空草稿直接用，非空且末尾无空白时补换行 */
export function appendVoiceText(draft: string, text: string): string {
  const clean = text.trim();
  if (!clean) return draft;
  if (!draft.trim()) return clean;
  return /[\s\n]$/.test(draft) ? `${draft}${clean}` : `${draft}\n${clean}`;
}

/**
 * 把草稿里的识别原文替换成润色结果。
 * - 原文不存在（已发送/被删）：返回 null；
 * - 原文出现多次（无法唯一定位）：保守返回 null，避免改错片段。
 */
export function replaceVoiceSegment(
  draft: string,
  raw: string,
  polished: string,
): string | null {
  if (!raw || !polished || raw === polished) return null;
  const first = draft.indexOf(raw);
  if (first === -1) return null;
  if (draft.indexOf(raw, first + raw.length) !== -1) return null;
  return draft.slice(0, first) + polished + draft.slice(first + raw.length);
}
