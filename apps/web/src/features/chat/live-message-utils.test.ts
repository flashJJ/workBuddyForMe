import { describe, expect, it } from 'vitest';
import type { Message, ToolSubstep } from '@wbfm/shared/types';
import type { SsePayloadMap } from '@wbfm/shared/api';
import { applyToolSubsteps, applyToolTraceEnd } from './live-message-utils';

function assistantWithTrace(tool: string): Message[] {
  // 仅覆盖工具轨迹补丁逻辑访问的字段，经 unknown 收窄为 Message 视图
  return [
    {
      id: 'm1',
      role: 'assistant',
      conversationId: 'conv',
      content: '',
      status: 'streaming',
      modelId: 'x',
      providerId: 'p',
      tokens: null,
      citations: [],
      toolTrace: [
        {
          callId: 'call-1',
          tool,
          argsSummary: '',
          status: 'running',
          durationMs: 0,
          resultSummary: '执行中…',
          startedAt: '2026-10-05T00:00:00.000Z',
        },
      ],
      contentParts: [],
      feedback: null,
      feedbackAt: null,
      createdAt: '2026-10-05T00:00:00.000Z',
    } as unknown as Message,
  ];
}

const sub = (id: string, status: ToolSubstep['status']): ToolSubstep => ({
  id,
  label: id,
  status,
});

describe('live-message-utils：v0.8 工具子步骤', () => {
  it('substep 事件按 callId 合并到正在运行的工具条目', () => {
    const payload: Extract<SsePayloadMap['tool'], { phase: 'substep' }> = {
      phase: 'substep',
      callId: 'call-1',
      substeps: [sub('start', 'ok'), sub('llm', 'running')],
    };
    const next = applyToolSubsteps(assistantWithTrace('flow:x'), payload);
    const trace = next![0]!.toolTrace!;
    expect(trace[0]!.substeps?.map((s) => `${s.id}:${s.status}`)).toEqual([
      'start:ok',
      'llm:running',
    ]);
  });

  it('end 事件保留流式阶段累积的子步骤快照', () => {
    const withSubs = applyToolSubsteps(assistantWithTrace('flow:x'), {
      phase: 'substep',
      callId: 'call-1',
      substeps: [sub('start', 'ok')],
    });
    const next = applyToolTraceEnd(withSubs, {
      phase: 'end',
      callId: 'call-1',
      tool: 'flow:x',
      status: 'ok',
      durationMs: 3000,
      resultSummary: '执行完成',
      source: 'flow',
      permission: 'read',
    });
    const entry = next![0]!.toolTrace![0]!;
    expect(entry.status).toBe('ok');
    expect(entry.substeps).toHaveLength(1);
    expect(entry.substeps?.[0]?.id).toBe('start');
  });
});
