import type { ChatMessage } from '@wbfm/ai';
import {
  AGENT_LIMITS,
  reviewVerdictSchema,
  type ExecutorOutcome,
  type ReviewVerdictPayload,
  type SubtaskSpec,
} from '@wbfm/shared/schemas';
import { extractJsonObject } from './planner-protocol';

/**
 * Reviewer 角色协议（纯函数，M1）：
 * 对照原始目标与子任务验收标准，裁决执行者交付物：
 * approve（通过交付）/ revise（附意见返工）/ reject（无法完成，终止）。
 * 审查者只裁决不动手补做。
 */

export class ReviewerProtocolError extends Error {
  constructor(
    public readonly code: 'no_json' | 'invalid_shape',
    message: string,
    public readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'ReviewerProtocolError';
  }
}

/** 声明了知识检索/桌面操作的工具域（用于结构初筛判断证据/工具是否必要） */
const KNOWLEDGE_SCOPE = 'knowledge';
const TOOL_SCOPE_PREFIXES = ['mcp:', 'flow:', 'desktop'];

function declaresToolUse(scopes?: string[]): boolean {
  if (!scopes || scopes.length === 0) return false;
  return scopes.some((s) => s === KNOWLEDGE_SCOPE || TOOL_SCOPE_PREFIXES.some((p) => s.startsWith(p)));
}

/** 结构初筛结果：纯规则可机械判定的交付完备性（模型裁决的辅助输入） */
export interface AcceptanceStructuralCheck {
  /** 结论存在且在长度限内 */
  hasConclusion: boolean;
  /** 声明了工具/知识域时，至少有一条证据或工具调用记录 */
  hasEvidenceForToolScope: boolean;
  /** 未竟事项为空（非空时审查者应判断是真实边界还是偷懒） */
  hasNoUnfinished: boolean;
  /** 人类可读问题清单（注入审查上下文） */
  issues: string[];
}

/**
 * 交付物结构初筛（不做自然语言语义判断）：
 * - 结论非空（zod 已保证长度，此处防御运行时脏数据）；
 * - 子任务声明 knowledge/mcp/flow/desktop 域时，交付必须带证据或工具轨迹；
 * - unfinished 非空作为风险信号（不直接判失败，交审查者裁决）。
 */
export function checkAcceptanceStructural(
  subtask: SubtaskSpec,
  outcome: ExecutorOutcome,
): AcceptanceStructuralCheck {
  const issues: string[] = [];
  const hasConclusion = outcome.summary.trim().length > 0;
  if (!hasConclusion) issues.push('交付缺少结论（summary 为空）');

  const expectsEvidence = declaresToolUse(subtask.toolScopes) || Boolean(subtask.knowledgeBaseId);
  const hasEvidenceForToolScope =
    !expectsEvidence || outcome.evidence.length > 0 || outcome.toolCalls.length > 0;
  if (expectsEvidence && !hasEvidenceForToolScope) {
    issues.push('子任务要求知识/工具域，但交付没有引用证据也没有工具调用记录');
  }

  const hasNoUnfinished = outcome.unfinished.length === 0;
  if (!hasNoUnfinished) {
    issues.push(`执行者声明了 ${outcome.unfinished.length} 项未竟事项，需判断是否构成返工`);
  }

  return { hasConclusion, hasEvidenceForToolScope, hasNoUnfinished, issues };
}

export const REVIEWER_SYSTEM_PROMPT = `你是多智能体协作中的审查者（Reviewer）。对照用户目标与子任务完成标准，验收执行者的交付物。

【输出协议】只输出一个 JSON 对象，禁止输出任何其他文字或 markdown 代码块标记：
{"verdict":"approve|revise|reject","reviewNotes":"裁决理由（revise/reject 必填）","acceptanceResults":[{"passed":true,"note":"依据"}]}

【裁决语义】
- approve：每条完成标准都被交付内容满足，证据真实引用自交付材料，可以交付用户
- revise：方向正确但不达标（缺证据/回答不完整/偏离标准），给出可执行的修改意见，规划者会重新派单
- reject：任务无法在当前子任务范围内完成（前提错误/资料缺失/目标矛盾），应终止并告知用户

【准则】
- 你只审查不补做；逐条对照 acceptance 给结论，acceptanceResults 条数与完成标准一致
- 证据必须能在交付材料中找到，禁止把无引用的臆测判为通过
- 交付声明了未竟事项时，只有在核心标准未完成时才 revise；边界性缺失可 approve 但在 note 注明`;

export interface ReviewerPromptInput {
  goal: string;
  subtask: SubtaskSpec;
  outcome: ExecutorOutcome;
  round: number;
}

/** 组装审查消息：目标/子任务/结构化交付/结构初筛作为系统侧提示 */
export function buildReviewMessages(input: ReviewerPromptInput): ChatMessage[] {
  const check = checkAcceptanceStructural(input.subtask, input.outcome);
  const acceptanceLines = input.subtask.acceptance
    .map((a, i) => `${i + 1}. ${a}`)
    .join('\n');
  const evidenceLines =
    input.outcome.evidence.length > 0
      ? input.outcome.evidence
          .slice(0, 10)
          .map((c, i) => `[${i + 1}] ${c.documentName}${c.staticKind && c.staticKind !== 'chunk' ? `（${c.staticKind}）` : ''}`)
          .join('\n')
      : '（无引用证据）';
  const toolLine =
    input.outcome.toolCalls.length > 0 ? input.outcome.toolCalls.join(' → ') : '（无工具调用）';
  const unfinishedLine =
    input.outcome.unfinished.length > 0 ? input.outcome.unfinished.map((u) => `· ${u}`).join('\n') : '（无）';
  const structuralLine = check.issues.length > 0 ? check.issues.map((x) => `· ${x}`).join('\n') : '· 结构初筛未发现问题';

  const text = [
    `【用户原始目标】${input.goal}`,
    `【当前轮次】第 ${input.round + 1} 轮`,
    `【子任务】${input.subtask.title}\n${input.subtask.brief}`,
    `【完成标准】\n${acceptanceLines}`,
    `【执行者结论】\n${input.outcome.summary}`,
    `【引用证据】\n${evidenceLines}`,
    `【工具调用序列】${toolLine}`,
    `【未竟事项】\n${unfinishedLine}`,
    `【系统结构初筛（参考，不替代你的裁决）】\n${structuralLine}`,
    '请输出裁决 JSON。',
  ].join('\n\n');
  return [
    { role: 'system', content: REVIEWER_SYSTEM_PROMPT },
    { role: 'user', content: text },
  ];
}

export type ParseVerdictResult =
  | { ok: true; review: ReviewVerdictPayload }
  | { ok: false; error: 'no_json' | 'invalid_shape'; issues: string[] };

/** 解析并校验裁决（revise/reject 必须有 reviewNotes，由 schema 之外在此补充） */
export function parseVerdict(content: string): ParseVerdictResult {
  const raw = extractJsonObject(content);
  if (raw === null) {
    return { ok: false, error: 'no_json', issues: ['输出中未找到合法 JSON 对象'] };
  }
  const parsed = reviewVerdictSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'invalid_shape',
      issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(根)'}: ${i.message}`),
    };
  }
  const review = parsed.data;
  if (review.verdict !== 'approve' && !(review.reviewNotes?.trim()?.length)) {
    return {
      ok: false,
      error: 'invalid_shape',
      issues: [`${review.verdict} 裁决必须提供 reviewNotes 修改/终止理由`],
    };
  }
  if (review.reviewNotes && review.reviewNotes.length > AGENT_LIMITS.REVIEW_NOTES_MAX) {
    return { ok: false, error: 'invalid_shape', issues: ['reviewNotes 超长'] };
  }
  return { ok: true, review };
}
