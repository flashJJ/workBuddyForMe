/**
 * v1.9 M2：agent run SSE 帧 → 舞台指令（StageDirection）纯映射适配器。
 *
 * 不可变边界（docs/plan/v1.9/02-cast与舞台协议.md §4）：
 * - 只做映射：不碰模型、不重放请求、不写 run 状态、不产生交互按钮；
 * - executor 的 agent_delta 是工具/思考流，不逐字念，只驱动 working 动作；
 * - agent_budget 不上舞台台词；agent_tool_confirm 只挂 thinking；
 * - 谢幕/失败/裁决用 sys() 语言中立标记，渲染端按 UI 语言解码。
 */
import type { SseEvent } from '@wbfm/shared/api';
import type {
  AgentHandoffView,
  AgentPhase,
  AgentRole,
  ReviewVerdict,
  StageCastMember,
  StageDirection,
  StageMotionGroup,
  StageSlot,
} from '@wbfm/shared/schemas';
import { sys } from '../i18n/system-text';

/** 适配器消费的协作帧（agent_delta 目前由帧协议预留，runner 未发，映射照样覆盖） */
export type StageAgentFrame = SseEvent<
  | 'agent_phase'
  | 'agent_handoff'
  | 'agent_review'
  | 'agent_budget'
  | 'agent_delta'
  | 'agent_tool_confirm'
  | 'done'
  | 'error'
>;

/** 协作固定三角色 → 默认槽位（handoff 顺序即视觉动线：左→中→右） */
export const AGENT_ROLE_SLOT: Record<AgentRole, StageSlot> = {
  planner: 'left',
  executor: 'center',
  reviewer: 'right',
};

const ROLE_AVATARS: Record<AgentRole, string> = {
  planner: 'hiyori',
  executor: 'haru',
  reviewer: 'mao',
};

const ROLE_NAMES: Record<AgentRole, string> = {
  planner: '规划',
  executor: '执行',
  reviewer: '审查',
};

const SLOTS: StageSlot[] = ['left', 'center', 'right'];

/** 交接/裁决短台词上限（台词策略：≤1 句，不念 acceptance 全文） */
const LINE_MAX = 80;
/** delta 流式文本上屏上限（schema speech.text 上限 2000，这里更短避免糊脸） */
const DELTA_LINE_MAX = 200;

export interface StageAdapterState {
  /** 已产出 speech 条数（speech.seq 真源） */
  seq: number;
  /** 最近一次交接边（去重/谢幕判断用） */
  lastEdge: string | null;
}

export const INITIAL_STAGE_ADAPTER_STATE: StageAdapterState = { seq: 0, lastEdge: null };

/**
 * 本场演员表（开场一次）。avatarOverrides 来自场景 cast 覆盖（§2.1 第一优先级），
 * 缺省回落角色→默认模型；形象列不加 assistants 表（M2 冻结）。
 */
export function createAgentStageCast(
  avatarOverrides?: Partial<Record<StageSlot, string>>,
): StageCastMember[] {
  return (Object.keys(AGENT_ROLE_SLOT) as AgentRole[]).map((role) => {
    const slot = AGENT_ROLE_SLOT[role];
    return {
      slot,
      kind: 'agent-role' as const,
      refId: role,
      displayName: ROLE_NAMES[role],
      avatarModelId: avatarOverrides?.[slot] ?? ROLE_AVATARS[role],
      expression: 'neutral',
      actionLabelKey: 'stage.run.action.listening',
    };
  });
}

/** 开场指令：演员表 */
export function openingDirections(
  avatarOverrides?: Partial<Record<StageSlot, string>>,
): StageDirection[] {
  return [{ t: 'cast', members: createAgentStageCast(avatarOverrides) }];
}

/** 截一句短台词：取首个句读片段，超长加省略号 */
function clipLine(raw: string | null | undefined, max = LINE_MAX): string {
  const text = (raw ?? '').trim();
  if (!text) return '';
  const firstSentence = text.split(/[。！？!?\n]/u).find((s) => s.trim().length > 0)?.trim() ?? text;
  return firstSentence.length > max ? `${firstSentence.slice(0, max - 1)}…` : firstSentence;
}

function motion(slot: StageSlot, group: StageMotionGroup): StageDirection {
  return { t: 'motion', slot, group };
}

function speech(state: StageAdapterState, slot: StageSlot, text: string): StageDirection[] {
  if (!text) return [];
  const nextSeq = state.seq + 1;
  state.seq = nextSeq;
  return [{ t: 'speech', slot, text, seq: nextSeq }];
}

/** 主角动作 + 其余两槽倾听（等待期不允许角色僵住） */
function focusScene(focus: StageSlot, lead: StageMotionGroup): StageDirection[] {
  return [
    { t: 'focus', slot: focus },
    ...SLOTS.filter((s) => s !== focus).map((s) => motion(s, 'listening')),
    motion(focus, lead),
  ];
}

function allIdle(): StageDirection[] {
  return SLOTS.map((s) => motion(s, 'idle'));
}

function verdictExpression(verdict: ReviewVerdict): string {
  if (verdict === 'approve') return 'joy';
  if (verdict === 'reject') return 'sadness';
  return 'neutral';
}

function verdictLine(handoff: AgentHandoffView): string {
  const verdict = handoff.payload.verdict;
  if (verdict === 'approve') return sys('stage.run.curtain.done');
  const note = clipLine(handoff.payload.reviewNotes);
  if (verdict === 'reject') {
    return note ? `${sys('stage.run.verdict.reject')}（${note}）` : sys('stage.run.verdict.reject');
  }
  return note ? `${sys('stage.run.verdict.revise')}（${note}）` : sys('stage.run.verdict.revise');
}

/** 交接帧 → 源角色短台词 + focus 转移（终态回放无 phase 帧时也能自成一幕） */
function adaptHandoff(state: StageAdapterState, handoff: AgentHandoffView): StageDirection[] {
  state.lastEdge = `${handoff.fromRole}:${handoff.toRole}`;
  const fromSlot = AGENT_ROLE_SLOT[handoff.fromRole];
  const p = handoff.payload;

  if (handoff.fromRole === 'planner' && handoff.toRole === 'executor') {
    return [
      ...speech(state, fromSlot, clipLine(p.subtask?.title) || clipLine(p.subtask?.brief)),
      motion(fromSlot, 'idle'),
      ...focusScene('center', 'working'),
    ];
  }
  if (handoff.fromRole === 'executor' && handoff.toRole === 'reviewer') {
    return [
      ...speech(state, fromSlot, clipLine(p.outcome?.summary)),
      motion(fromSlot, 'idle'),
      ...focusScene('right', 'thinking'),
    ];
  }
  if (handoff.fromRole === 'reviewer' && handoff.toRole === 'planner') {
    return [
      ...speech(state, fromSlot, verdictLine(handoff)),
      { t: 'expression', slot: fromSlot, tag: 'neutral' },
      motion(fromSlot, 'idle'),
      ...focusScene('left', 'thinking'),
    ];
  }
  // reviewer:user：终幕——审查者宣布裁决后散焦、全员待机
  return [
    ...speech(state, fromSlot, verdictLine(handoff)),
    { t: 'expression', slot: fromSlot, tag: verdictExpression(p.verdict ?? 'approve') },
    ...allIdle(),
    { t: 'focus', slot: null },
  ];
}

const PHASE_LEAD: Record<Exclude<AgentPhase, 'failed'>, StageMotionGroup | null> = {
  planning: 'thinking',
  executing: 'working',
  reviewing: 'thinking',
  done: null,
};

/**
 * 单帧映射（纯函数，原地推进 state 并返回指令；state 由调用方串行持有）。
 * 喂录制 SSE 帧序列即可断言指令顺序——单测就是它的回放台。
 */
export function adaptStageFrame(
  state: StageAdapterState,
  frame: StageAgentFrame,
): StageDirection[] {
  switch (frame.event) {
    case 'agent_phase': {
      const { phase, role } = frame.data;
      if (phase === 'failed') return [{ t: 'focus', slot: null }, ...allIdle()];
      if (phase === 'done') return [{ t: 'focus', slot: null }, ...allIdle()];
      const slot = role ? AGENT_ROLE_SLOT[role] : null;
      const lead = PHASE_LEAD[phase];
      if (!slot || !lead) return [];
      return focusScene(slot, lead);
    }
    case 'agent_handoff':
      return adaptHandoff(state, frame.data.handoff);
    case 'agent_review': {
      // 台词随其后的 handoff 走；这里只切审查者表情

      return [
        {
          t: 'expression',
          slot: 'right',
          tag: verdictExpression(frame.data.review.verdict),
        },
      ];
    }
    case 'agent_delta': {
      const slot = AGENT_ROLE_SLOT[frame.data.role];
      // executor 的工具/思考流不逐字念（协议 §4），只驱动 working 微动作
      if (frame.data.role === 'executor') return [motion(slot, 'working')];
      return speech(state, slot, clipLine(frame.data.content, DELTA_LINE_MAX));
    }
    case 'agent_tool_confirm':
      // 舞台无交互：不放假按钮；审批仍发生在任务中心。executor 挂 thinking
      return focusScene('center', 'thinking');
    case 'done':
      // 终幕台词已由 reviewer:user 交接宣布；done 只散焦归位
      return [{ t: 'focus', slot: null }, ...allIdle()];
    case 'error':
      return [
        ...speech(state, 'center', sys('stage.run.curtain.failed')),
        { t: 'expression', slot: 'center', tag: 'sadness' },
        ...allIdle(),
        { t: 'focus', slot: null },
      ];
    case 'agent_budget':
      return [];
    default:
      return [];
  }
}
