import type { ChatMessage } from '@wbfm/ai';
import {
  AGENT_LIMITS,
  subtaskSpecSchema,
  type ReviewVerdictPayload,
  type SubtaskSpec,
} from '@wbfm/shared/schemas';

/**
 * Planner 角色协议（纯函数，M1）：
 * 照搬 v0.7 llm-planner 的「system JSON 协议 + build/parse 纯函数」模式——
 * 角色 LLM 客户端只负责把消息发给模型，协议解析/校验全部在此可单测。
 *
 * Planner 职责：把用户目标（含上轮审查意见）分解为单个结构化子任务单。
 * 禁止：直接调工具、产出最终答案。
 */

export class PlannerProtocolError extends Error {
  constructor(
    public readonly code: 'no_json' | 'invalid_shape',
    message: string,
    public readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'PlannerProtocolError';
  }
}

export const PLANNER_SYSTEM_PROMPT = `你是多智能体协作中的规划者（Planner）。把用户目标分解为一个可执行子任务单，交给执行者（Executor）完成。

【输出协议】只输出一个 JSON 对象，禁止输出任何其他文字或 markdown 代码块标记：
{"title":"子任务一句话标题","brief":"具体执行说明（背景/要求/边界）","acceptance":["完成标准1","完成标准2"],"toolScopes":["允许的工具域"],"knowledgeBaseId":null}

【字段要求】
- title：不超过 ${AGENT_LIMITS.SUBTASK_TITLE_MAX} 字；brief：1-${AGENT_LIMITS.SUBTASK_BRIEF_MAX} 字，写清要做什么、用什么资料、不要做什么
- acceptance：${AGENT_LIMITS.ACCEPTANCE_MIN}-${AGENT_LIMITS.ACCEPTANCE_MAX} 条可客观核对的完成标准，审查者将逐条验收
- toolScopes：只用需要的最小工具域（如 "knowledge"、"mcp:服务器名"、"flow:工作流名"、"desktop"）；纯知识问答只给 ["knowledge"]；不需要工具时给空数组
- knowledgeBaseId：指定知识库 id；继承助手绑定或不指定时给 null

【准则】
- 一次只派一个子任务（首期串行执行，不要输出多个）
- 子任务必须能在一个执行回合内完成；被审查打回时，根据审查意见调整方案，不要原样重复`;

/** 返工上下文：上轮派单与审查意见（首轮缺省） */
export interface PlannerHistoryEntry {
  round: number;
  subtask: SubtaskSpec;
  review: ReviewVerdictPayload;
}

export interface PlannerPromptInput {
  goal: string;
  history: PlannerHistoryEntry[];
  /** 执行者可用工具域提示（来自助手配置/调用方） */
  availableToolScopes: string[];
  /** 助手绑定知识库名（提示模型优先使用，id 仍需模型在 knowledgeBaseId 回填） */
  knowledgeBaseHint?: { id: string | null; name: string } | null;
}

function formatHistory(history: PlannerHistoryEntry[]): string {
  if (history.length === 0) return '（首轮，无返工记录）';
  const last = history[history.length - 1]!;
  const title = last.subtask.title;
  const notes = last.review.reviewNotes?.trim() || '（审查未附文字意见）';
  const failed = last.subtask.acceptance
    .map((a, i) => {
      const r = last.review.acceptanceResults[i];
      return r?.passed ? null : `· ${a}${r?.note ? `（${r.note}）` : ''}`;
    })
    .filter(Boolean)
    .join('\n');
  return [
    `这是第 ${last.round + 1} 次派单（上轮被 ${last.review.verdict}）。`,
    `上轮子任务：${title}`,
    `审查意见：${notes}`,
    failed ? `未通过的验收项：\n${failed}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** 组装规划消息：system 协议 + user（目标/返工历史/工具域/知识提示）。
 * 命名带 Agent 前缀以区别 v0.7 桌面单 Agent 的 buildPlannerMessages。 */
export function buildAgentPlannerMessages(input: PlannerPromptInput): ChatMessage[] {
  const kbLine = input.knowledgeBaseHint?.id
    ? `助手绑定知识库：${input.knowledgeBaseHint.name}（id=${input.knowledgeBaseHint.id}，需要时在 knowledgeBaseId 回填此 id）`
    : '助手未绑定知识库（knowledgeBaseId 给 null）';
  const text = [
    `【用户目标】${input.goal}`,
    `【可用工具域】${input.availableToolScopes.join('、') || '（无可用工具，仅能基于已有信息作答）'}`,
    `【知识库】${kbLine}`,
    `【历史交接】\n${formatHistory(input.history)}`,
    '请输出子任务单 JSON。',
  ].join('\n\n');
  return [
    { role: 'system', content: PLANNER_SYSTEM_PROMPT },
    { role: 'user', content: text },
  ];
}

/** 从模型输出提取首个 JSON 对象（容忍 markdown 包裹与前后杂文本） */
export function extractJsonObject(content: string): unknown | null {
  const match = /\{[\s\S]*\}/.exec(content.trim());
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export type ParsePlanResult =
  | { ok: true; subtask: SubtaskSpec }
  | { ok: false; error: 'no_json' | 'invalid_shape'; issues: string[] };

/**
 * 解析并校验子任务单：
 * 找不到 JSON → no_json；JSON 不符合 zod 契约 → invalid_shape（附字段级问题）。
 */
export function parsePlan(content: string): ParsePlanResult {
  const raw = extractJsonObject(content);
  if (raw === null) {
    return { ok: false, error: 'no_json', issues: ['输出中未找到合法 JSON 对象'] };
  }
  const parsed = subtaskSpecSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'invalid_shape',
      issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(根)'}: ${i.message}`),
    };
  }
  return { ok: true, subtask: parsed.data };
}
