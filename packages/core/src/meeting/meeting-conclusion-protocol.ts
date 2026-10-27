import type { MeetingMessageRecord, MeetingRecord } from '@wbfm/shared/types';
import {
  meetingConclusionDraftSchema,
  type MeetingConclusionDraft,
} from '@wbfm/shared/schemas';

/** 单次结论调用可携带的转录上限；超出先分块压缩 */
export const CONCLUSION_TRANSCRIPT_MAX_CHARS = 24_000;
/** 单块压缩预算 */
export const CONCLUSION_CHUNK_CHARS = 8_000;
/** 最多压缩块数；更多时保留首尾并显式标注省略 */
export const CONCLUSION_CHUNK_MAX = 6;

export interface ConclusionPrompt {
  system: string;
  user: string;
}

export function buildConclusionSystemPrompt(): string {
  return [
    '你是会议结论整理助手。只输出一个 JSON 对象，不要 Markdown 代码围栏、不要解释。',
    'JSON 结构：',
    '{"summary":"一句话结论","decisions":["已达成决策"],"openQuestions":["未决问题"],"actionItems":[{"content":"行动项","ownerLabel":"负责人显示名","ownerMemberId":null,"dueAt":null}]}',
    '规则：',
    '1. 只依据提供的会议转录，不补充转录中没有的事实、数字或人名。',
    '2. 没有明确决策/未决问题/行动项时，对应数组输出空数组，不要凑数。',
    '3. ownerLabel 只能使用成员名或“用户/未指定”；ownerMemberId 只能填提供的成员 id 或 null。',
    '4. dueAt 必须是 ISO 8601 时间（带时区）或 null；不确定就填 null，不要猜日期。',
    '5. summary 不超过 2000 字；actionItems 最多 30 条；decisions/openQuestions 各最多 20 条。',
  ].join('\n');
}

export function buildChunkSystemPrompt(): string {
  return [
    '你是会议转录压缩助手。只输出纯文本要点，不要 JSON、不要代码围栏。',
    '保留：明确决策、分歧、行动项、负责人、截止时间、关键事实与数字。',
    '删除：寒暄、重复表达、跑题内容。不要添加转录中没有的信息。',
  ].join('\n');
}

export function formatTranscript(messages: MeetingMessageRecord[]): string {
  return messages
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((m) => `#${m.seq} ${m.speakerName}（${m.speakerKind}）：${m.content}`)
    .join('\n');
}

/**
 * 按消息边界切块，尽量不拆单条消息；单条超长时按字符切。
 * 超过最大块数时保留首 3 块 + 末 3 块，并在中间插入省略标记。
 */
export function splitTranscript(messages: MeetingMessageRecord[]): string[] {
  const chunks: string[] = [];
  let current = '';
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };
  for (const message of messages.slice().sort((a, b) => a.seq - b.seq)) {
    const line = `#${message.seq} ${message.speakerName}（${message.speakerKind}）：${message.content}`;
    if (line.length > CONCLUSION_CHUNK_CHARS) {
      push();
      for (let i = 0; i < line.length; i += CONCLUSION_CHUNK_CHARS) {
        chunks.push(line.slice(i, i + CONCLUSION_CHUNK_CHARS));
      }
      continue;
    }
    if (current.length + line.length + 1 > CONCLUSION_CHUNK_CHARS) push();
    current += (current ? '\n' : '') + line;
  }
  push();
  if (chunks.length <= CONCLUSION_CHUNK_MAX) return chunks;
  const head = chunks.slice(0, 3);
  const tailCount = Math.max(1, CONCLUSION_CHUNK_MAX - head.length - 1);
  const tail = chunks.slice(-tailCount);
  return [...head, '【中间转录过长，已省略】', ...tail];
}

export function buildConclusionUserPrompt(params: {
  meeting: MeetingRecord;
  members: Array<{ id: string; name: string }>;
  transcript: string;
  compressed?: boolean;
}): string {
  const memberLines = params.members.map((m) => `- ${m.name}（id=${m.id}）`).join('\n') || '- （无）';
  return [
    `会议议题：${params.meeting.topic}`,
    `会议成员：\n${memberLines}`,
    params.compressed
      ? `转录分段摘要（原始转录过长，已先压缩）：\n${params.transcript}`
      : `完整转录：\n${params.transcript}`,
    '请输出严格符合约定结构的 JSON。',
  ].join('\n\n');
}

export function buildChunkUserPrompt(meeting: MeetingRecord, chunk: string): string {
  return [`会议议题：${meeting.topic}`, `转录片段：`, chunk, '请压缩为要点。'].join('\n\n');
}

export type ParsedConclusion =
  | { ok: true; draft: MeetingConclusionDraft }
  | { ok: false; reason: 'no_json' | 'invalid_shape'; issues: string[] };

/** 容忍 Markdown 围栏与前后杂文本，取首个 JSON 对象并做 Zod 校验 */
export function parseConclusionDraft(raw: string): ParsedConclusion {
  const match = /\{[\s\S]*\}/.exec(raw.trim());
  if (!match) return { ok: false, reason: 'no_json', issues: ['输出中未找到 JSON 对象'] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return { ok: false, reason: 'no_json', issues: ['JSON 解析失败'] };
  }
  const result = meetingConclusionDraftSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      reason: 'invalid_shape',
      issues: result.error.issues.map((i) => `${i.path.join('.') || '(根)'}: ${i.message}`),
    };
  }
  return { ok: true, draft: result.data };
}
