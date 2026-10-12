/**
 * v1.6 情绪内核的模型边界文本（恒定中文，与 UI 语言解喻——对齐 v1.5 模型边界约定）。
 *
 * - EMOTION_DIRECTIVE_BLOCK：尾块 JSON 输出协议指令；
 * - buildEmotionStateBlock：当前情绪/关系状态注入段（等级文案复用 i18n 中文真源，
 *   保证 UI 展示与模型读到的分级口径一致）。
 */
import { createTranslator, zhCN, type MessageKey } from '@wbfm/shared/i18n';
import {
  moodLevelOf,
  relationLevelOf,
  type EmotionState,
  type MoodLevel,
  type RelationLevel,
} from '@wbfm/shared/schemas';

const t = createTranslator(zhCN);

/** 情绪信号尾块协议指令（仅情绪功能开启时注入） */
export const EMOTION_DIRECTIVE_BLOCK = [
  '【情绪信号协议】回复正文结束后，另起一行输出一个 JSON 代码块（不要在正文里解释它、不要念出它）：',
  '```json',
  '{"emotion":"joy","intensity":0.7,"soulEvent":"praise"}',
  '```',
  '1. emotion 表示你本轮回复的主要情绪，八选一：neutral/joy/anger/sadness/surprise/disgust/fear/smirk；',
  '2. intensity 为 0 到 1 的情绪强度；soulEvent 表示用户本轮话语对你的意义：praise（夸奖/肯定/感谢）、belittle（数落/贬低）、chat（其他一切）；',
  '3. 该代码块是控制信号，不会展示给用户也不会被朗读；除该代码块外不要输出任何 JSON。',
].join('\n');

function moodLabel(value: number): string {
  const level: MoodLevel = moodLevelOf(value);
  if (value < 0) return t(`emotion.levels.mood.${level}` as MessageKey);
  return level === 'none' ? '无明显情绪' : t(`emotion.levels.mood.${level}` as MessageKey);
}

function relationLabel(value: number): string {
  const level: RelationLevel = relationLevelOf(value);
  return t(`emotion.levels.relation.${level}` as MessageKey);
}

/** 字段间隔（全角空格，规避源码内不规则空白 lint） */
const SEP = String.fromCharCode(0x3000);

/** 当前情绪状态段；固定禁令：模型不得宣称自己修改数值 */
export function buildEmotionStateBlock(state: EmotionState): string {
  const lines = [
    '【当前情绪状态】',
    `心情：${moodLabel(state.mood.happiness)}${SEP}生气：${moodLabel(state.mood.anger)}${SEP}难过：${moodLabel(state.mood.sadness)}`,
    `亲密度：${relationLabel(state.relation.intimacy)}${SEP}信任度：${relationLabel(state.relation.trust)}`,
    `当前需求：${t(`emotion.need.${state.currentNeed}` as MessageKey)}`,
    '这是你当前的真实状态。请依据你的性格与该状态决定本轮的语气与情绪，并按情绪信号协议在回复末尾输出信号；不要在正文中提及这些数值，也不要宣称自己修改了它们。',
  ];
  return lines.join('\n');
}
