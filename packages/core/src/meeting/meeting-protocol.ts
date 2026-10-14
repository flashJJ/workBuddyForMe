/**
 * v1.9 M3 会议防串角协议纯函数（docs/plan/v1.9/03）。
 * 不碰模型/DB：转录标注、@ 解析、auto 提名校验、请求形状、席次映射全部在此，
 * 是「下一位发言者」判定的唯一真源——前端只传用户动作与模式，永不直接指定 speaker id。
 */
import type { ChatMessage } from '@wbfm/ai';
import type { StageSlot } from '@wbfm/shared/schemas';
import { MEETING_LIMITS } from '@wbfm/shared/schemas';

/** 转录条目（落库消息的投影，只取协议需要的字段） */
export interface TranscriptEntry {
  speakerKind: 'user' | 'assistant';
  speakerName: string;
  content: string;
}

/** auto 提名校验结果 */
export type AutoNextDecision =
  | { ok: true; speakerId: string }
  | { ok: false; reason: 'not-member' | 'self' | 'repeat' | 'round-limit' };

/** 从正文提取 @成员名（@ 后到空格/标点，保序去重；@ 所有人等魔法词不支持） */
export function parseMentionNames(content: string): string[] {
  const re = /@([^\s@，。！？!?，；;:：、""''（）()【】[\]{},.]{1,40})/gu;
  const names: string[] = [];
  for (const m of content.matchAll(re)) {
    const name = m[1]!.trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** 名字 → 成员 id；不在会议成员中的名字一律忽略（防越权让非成员发言） */
export function mapMentionsToIds(
  names: string[],
  members: Array<{ id: string; name: string }>,
): string[] {
  const ids: string[] = [];
  for (const name of names) {
    const hit = members.find((member) => member.name === name);
    if (hit && !ids.includes(hit.id)) ids.push(hit.id);
  }
  return ids;
}

/** 带身份标注的转录行（近 window 条；用户行与助手行前缀严格区分） */
export function buildTranscriptLines(
  entries: readonly TranscriptEntry[],
  window: number = MEETING_LIMITS.TRANSCRIPT_WINDOW,
): string[] {
  return entries.slice(-window).map((entry) =>
    entry.speakerKind === 'user'
      ? `[用户·${entry.speakerName}] ${entry.content}`
      : `[助手·${entry.speakerName}] ${entry.content}`,
  );
}

/**
 * system 段：身份规则 + 转录 + 自己的角色卡正文。
 * 只注入当前发言成员的卡（其他成员卡绝不注入，防止模仿人格）。
 */
export function buildMeetingSystem(params: {
  selfName: string;
  userLabel: string;
  personaBlock: string | null;
  transcriptLines: string[];
  identityRuleTemplate: string;
  lengthRule: string;
}): string {
  const parts = [
    params.identityRuleTemplate.replaceAll('{name}', params.selfName),
    params.lengthRule,
  ];
  if (params.personaBlock) parts.push(params.personaBlock);
  if (params.transcriptLines.length > 0) {
    parts.push('【会议转录（最近发言，带标注的是别人说的话，不是你说的）】');
    parts.push(params.transcriptLines.join('\n'));
  }
  return parts.join('\n\n');
}

/** 恒为 [system, user] 的请求形状，尾条永远是 user（协议 §4.2） */
export function buildMeetingMessages(system: string, userContent: string): ChatMessage[] {
  return [
    { role: 'system', content: system },
    { role: 'user', content: userContent },
  ];
}

/** 单条发言截断（超长服务端截断展示并标记；协议 §5 ≤200 字） */
export function clipSpeech(
  raw: string,
  max: number = MEETING_LIMITS.SPEECH_MAX,
): { text: string; truncated: boolean } {
  const text = raw.trim();
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max - 1) + '…', truncated: true };
}

const AUTO_JSON_RE = /\r?\n\s*\{\s*"next_speaker"\s*:\s*"([^"]{1,40})"\s*\}\s*$/u;

/**
 * 解析 auto 接龙成员回复末尾的 JSON 建议。
 * 解析失败/无建议 → next=null（静默回 manual，不弹错，协议 §7）。
 * 返回去掉标记块后的纯发言正文。
 */
export function extractAutoSuggestion(raw: string): {
  speech: string;
  nextSpeakerName: string | null;
} {
  const match = AUTO_JSON_RE.exec(raw);
  if (!match) return { speech: raw.trim(), nextSpeakerName: null };
  const speech = raw.slice(0, match.index).trim();
  return { speech, nextSpeakerName: match[1]!.trim() || null };
}

/**
 * auto 下一位校验（服务端硬规则，四种非法建议全部拒绝）：
 * - not-member：非本会议成员（含已删除成员）
 * - self：提名自己
 * - repeat：与上一位发言者相同（连续两轮同一人）
 * - round-limit：第 9 轮（auto 硬上限 8）
 */
export function validateAutoNext(params: {
  suggestedName: string | null;
  members: Array<{ id: string; name: string }>;
  currentSpeakerId: string;
  previousSpeakerId: string | null;
  /** 若发起本次发言，将达到的 auto 轮次（1 起算） */
  nextRound: number;
}): AutoNextDecision {
  if (params.nextRound > MEETING_LIMITS.AUTO_ROUNDS_MAX) return { ok: false, reason: 'round-limit' };
  if (!params.suggestedName) return { ok: false, reason: 'not-member' };
  const target = params.members.find((m) => m.name === params.suggestedName);
  if (!target) return { ok: false, reason: 'not-member' };
  if (target.id === params.currentSpeakerId) return { ok: false, reason: 'self' };
  if (params.previousSpeakerId && target.id === params.previousSpeakerId) {
    return { ok: false, reason: 'repeat' };
  }
  return { ok: true, speakerId: target.id };
}

/**
 * 席次 → 舞台槽位（2–4 人均布，位置由布局层按 index/count 重算）。
 * 2 人对称左右；3 人左中右；4 人加 farRight。
 */
export function meetingSlotsFor(count: number): StageSlot[] {
  if (count === 2) return ['left', 'right'];
  if (count >= 4) return ['left', 'center', 'right', 'farRight'];
  return ['left', 'center', 'right'];
}
