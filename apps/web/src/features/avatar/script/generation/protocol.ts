import type { ScriptPrimitiveCatalog } from '../validation/registry';
import { GENERATED_SCENE_TRIGGERS } from './constants';

/**
 * P8.3：剧本生成提示词。
 *
 * 只暴露「可安全组合」的原语目录（预设/动作/行为/表情/视线/台词池/道具），
 * 让模型在受限 schema 内编排；输出由 parseGeneratedScene 再校验一次（fail-closed）。
 */

export interface ScriptGenerationPromptInput {
  primitives: ScriptPrimitiveCatalog;
  /** 本次指定/抽中的触发键 */
  trigger: string;
  /** 可用触发键全集（提示模型只能从这里选一个） */
  triggers?: readonly string[];
  /** P8.4：未收悬念/进行中的线/已用主题与梗 */
  storyContext?: string;
  context?: {
    hour?: number;
    relationshipLevel?: string;
    mood?: string;
  };
}

function list(values: readonly string[]): string {
  return values.join(', ');
}

export function buildScriptGenerationPrompt(input: ScriptGenerationPromptInput): {
  system: string;
  user: string;
} {
  const { primitives, trigger } = input;
  const triggers = input.triggers ?? GENERATED_SCENE_TRIGGERS;
  const system = [
    '你是桌宠剧本编排器。只输出一个 JSON 对象，不要 Markdown、不要解释。',
    '输出结构：',
    '{"story":{"title":"短标题","theme":"主题指纹","tags":["梗1","梗2"],"cliffhanger":"本场留下的悬念（可省略）","resolves":"收掉的旧悬念（可省略，与 cliffhanger 二选一）"},"scene":{"id":"gen.<小写英文短横线>","triggers":["<一个触发键>"],"priority":2,"cooldownMs":180000,"interrupt":"all","beats":[{"at":0,"cue":{"kind":"..."}}]}}',
    '硬性规则：',
    '1) id 必须以 gen. 开头；triggers 恰好一个，且只能取：' + list(triggers) + '。',
    '2) priority 只能是 1 或 2；cooldownMs 在 60000..600000；interrupt 固定 "all"。',
    '3) beats 按 at 升序，4..24 条，最后一条 at ≤ 30000；同一时刻最多一条 body（pose/gesture/motion/behavior）和一条 prop。',
    '4) 至少包含 1 条 line（台词池）；可选 1..2 条 expression/look/gesture；不要使用 speak/wait/branch/sound/effect/move/emit。',
    '5) 道具必须成对：attach 后要有更晚的 detach，show 后要有更晚的 hide；不要重复 attach/show。',
    '6) 只允许以下 cue 形状（id 必须与可用原语完全一致，behavior./motion. 前缀不能省）：',
    '   {"kind":"pose","preset":"<预设>"}',
    '   {"kind":"gesture","gesture":"<手势>","intensity":0..1}',
    '   {"kind":"motion","motion":"motion.wave"}',
    '   {"kind":"behavior","behavior":"behavior.chin-rest"}',
    '   {"kind":"prop","prop":"<道具>","action":"attach|detach|show|hide"}',
    '   {"kind":"expression","tag":"<表情>","holdMs":0..60000}',
    '   {"kind":"look","target":"<视线目标>","weight":0..1}',
    '   {"kind":"line","pool":"<台词池>"}',
    '7) 不要使用带状态的 pose（sleep/wake/face-away/face-front/sit-*）或 behavior.idle/sleep/wake/face-away/lifted/land；不要使用 motion:<file>。',
    '8) 剧情要有起承转：先注意用户（look/expression）→ 一个动作或行为 → 一句台词收尾；避免与常见问候重复。',
    '9) story.title ≤ 20 字；theme 是 2–8 字的主题指纹；tags 2–4 个短标签；cliffhanger/resolves ≤ 40 字，二选一。',
    '10) 若上下文里有未收悬念，优先续接并在 story.resolves 原样引用；否则留下新的 story.cliffhanger 让下一场接着演。',
    '11) 不要与「最近主题」重复，也不要复用「已用梗标签」。',
    '可用原语：',
    'pose 预设: ' + list(primitives.posePresets),
    'gesture: ' + list(primitives.gestures),
    'motion: ' + list(primitives.motions),
    'behavior: ' + list(primitives.behaviors),
    'expression: ' + list(primitives.expressions),
    'look: ' + list(primitives.lookTargets),
    'line 台词池: ' + list(primitives.linePools),
    'prop: ' + primitives.props.map((prop) => `${prop.id}(${prop.kind})`).join(', '),
  ].join('\n');

  const ctx = input.context ?? {};
  const user = [
    `触发键：${trigger}`,
    `时间：${ctx.hour ?? 12} 点；关系：${ctx.relationshipLevel ?? 'partner'}；心情：${ctx.mood ?? 'normal'}`,
    '当前剧情上下文：',
    input.storyContext ?? '（暂无历史剧情，可以开一条新线）',
    '请生成 1 条 6–20 秒的日常小剧本，只输出 JSON。',
  ].join('\n');

  return { system, user };
}
