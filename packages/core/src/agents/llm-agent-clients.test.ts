import { describe, expect, it } from 'vitest';
import type { ChatChunk } from '@wbfm/ai';
import type { ResolvedChatTarget } from '../chat/model-resolver';
import { createLlmPlannerClient, createLlmReviewerClient } from './llm-agent-clients';
import { PlannerProtocolError } from './planner-protocol';
import { ReviewerProtocolError } from './reviewer-protocol';
import type { ExecutorOutcome, SubtaskSpec } from '@wbfm/shared/schemas';

function fakeTarget(chunks: ChatChunk[]): ResolvedChatTarget {
  const provider = {
    chatStream: async function* () {
      for (const chunk of chunks) yield chunk;
    },
  } as unknown as ResolvedChatTarget['provider'];
  return {
    model: { modelId: 'fake-model' } as ResolvedChatTarget['model'],
    provider,
  };
}

const delta = (content: string): ChatChunk => ({ delta: content });
const usage = (): ChatChunk => ({
  delta: '',
  usage: { promptTokens: 40, completionTokens: 10, totalTokens: 50 },
});

const subtask: SubtaskSpec = {
  title: '查年假',
  brief: '在制度库查明年假天数',
  acceptance: ['给出天数'],
};
const outcome: ExecutorOutcome = {
  summary: '年假 15 天',
  evidence: [],
  toolCalls: [],
  unfinished: [],
};

describe('LLM 协作角色客户端（T2.4 通道接线）', () => {
  it('planner 客户端：解析子任务单 JSON 并透传 token 账；非法协议抛 PlannerProtocolError', async () => {
    const client = createLlmPlannerClient(
      fakeTarget([delta('结果：'), delta(JSON.stringify(subtask)), usage()]),
    );
    const result = await client.plan(
      { goal: '年假', history: [], availableToolScopes: ['knowledge'], knowledgeBaseHint: null },
      undefined,
    );
    expect(result.subtask).toMatchObject({ title: '查年假', brief: '在制度库查明年假天数' });
    expect(result.subtask.acceptance).toEqual(['给出天数']);
    expect(result.usage).toEqual({ promptTokens: 40, completionTokens: 10 });

    const bad = createLlmPlannerClient(fakeTarget([delta('我不会输出 JSON')]));
    await expect(
      bad.plan({ goal: 'g', history: [], availableToolScopes: [], knowledgeBaseHint: null }, undefined),
    ).rejects.toBeInstanceOf(PlannerProtocolError);
  });

  it('reviewer 客户端：解析裁决；revise 缺理由抛 ReviewerProtocolError', async () => {
    const ok = createLlmReviewerClient(
      fakeTarget([delta(JSON.stringify({ verdict: 'approve', acceptanceResults: [], reviewNotes: 'ok' })), usage()]),
    );
    const result = await ok.review({ goal: '年假', subtask, outcome, round: 0 }, undefined);
    expect(result.review.verdict).toBe('approve');
    expect(result.usage).toEqual({ promptTokens: 40, completionTokens: 10 });

    const invalid = createLlmReviewerClient(
      fakeTarget([delta(JSON.stringify({ verdict: 'revise', acceptanceResults: [] }))]),
    );
    await expect(
      invalid.review({ goal: '年假', subtask, outcome, round: 1 }, undefined),
    ).rejects.toBeInstanceOf(ReviewerProtocolError);
  });
});
