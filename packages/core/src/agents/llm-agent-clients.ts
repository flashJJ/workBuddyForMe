import type { ResolvedChatTarget } from '../chat/model-resolver';
import {
  buildAgentPlannerMessages,
  parsePlan,
  PlannerProtocolError,
} from './planner-protocol';
import {
  buildReviewMessages,
  parseVerdict,
  ReviewerProtocolError,
} from './reviewer-protocol';
import type { PlannerClient, ReviewerClient, RoleModelUsage } from './runner-types';

/**
 * v1.4 M2 协作角色 LLM 客户端：把 M1 的纯协议接上真实模型通道。
 * 只负责「发消息→收 token→调纯函数解析」，容错（连续 2 败降级）仍在 runner 层，
 * 解析失败抛对应 ProtocolError 被 callWithFallback 计次。
 */

async function collectStream(
  target: ResolvedChatTarget,
  messages: Parameters<ResolvedChatTarget['provider']['chatStream']>[0]['messages'],
  signal?: AbortSignal,
): Promise<{ content: string; usage: RoleModelUsage }> {
  let content = '';
  const usage: RoleModelUsage = { promptTokens: 0, completionTokens: 0 };
  const stream = target.provider.chatStream({
    model: target.model.modelId,
    messages,
    temperature: 0,
    maxTokens: 1024,
    ...(signal ? { signal } : {}),
  });
  for await (const chunk of stream) {
    if (chunk.delta) content += chunk.delta;
    if (chunk.usage) {
      usage.promptTokens = chunk.usage.promptTokens;
      usage.completionTokens = chunk.usage.completionTokens;
    }
  }
  return { content, usage };
}

/** Planner：子任务单 JSON 解析失败 → PlannerProtocolError（runner 计 1 次协议失败） */
export function createLlmPlannerClient(target: ResolvedChatTarget): PlannerClient {
  return {
    async plan(input, signal) {
      const messages = buildAgentPlannerMessages({
        goal: input.goal,
        history: input.history,
        availableToolScopes: input.availableToolScopes,
        knowledgeBaseHint: input.knowledgeBaseHint ?? null,
      });
      const { content, usage } = await collectStream(target, messages, signal);
      const parsed = parsePlan(content);
      if (!parsed.ok) {
        throw new PlannerProtocolError(parsed.error, 'Planner 输出未通过协议校验', parsed.issues);
      }
      return { subtask: parsed.subtask, usage };
    },
  };
}

/** Reviewer：裁决 JSON 解析/语义失败 → ReviewerProtocolError */
export function createLlmReviewerClient(target: ResolvedChatTarget): ReviewerClient {
  return {
    async review(input, signal) {
      const messages = buildReviewMessages(input);
      const { content, usage } = await collectStream(target, messages, signal);
      const parsed = parseVerdict(content);
      if (!parsed.ok) {
        throw new ReviewerProtocolError(parsed.error, 'Reviewer 输出未通过协议校验', parsed.issues);
      }
      return { review: parsed.review, usage };
    },
  };
}
