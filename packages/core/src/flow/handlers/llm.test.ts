import { describe, expect, it } from 'vitest';
import type { ChatProvider } from '@wbfm/ai';
import type { SceneContextSnapshotPayload } from '@wbfm/shared/schemas';
import type { FlowExecutionContext } from '../graph/types';
import { llmNodeHandler } from './llm';

function context(
  snapshots: SceneContextSnapshotPayload[],
  onMessages?: (messages: unknown) => void,
): FlowExecutionContext {
  const provider = {
    chatStream: async function* (params: { messages: unknown }) {
      onMessages?.(params.messages);
      yield { delta: '节点输出' };
    },
  } as unknown as ChatProvider;
  return {
    input: {},
    scope: new Map(),
    trigger: 'manual',
    interactive: true,
    resolveChatTarget: () => ({
      provider,
      model: { modelId: 'flow-model', contextWindow: 4096 },
    }),
    recordContextSnapshot: (payload: SceneContextSnapshotPayload) => snapshots.push(payload),
  } as unknown as FlowExecutionContext;
}

describe('flow llm 节点（v4.9 提示词预算）', () => {
  it('短提示词不写快照，消息保持原样', async () => {
    const snapshots: SceneContextSnapshotPayload[] = [];
    let seen: unknown;
    const result = await llmNodeHandler.run(
      { system: '系统', user: '你好' },
      context(snapshots, (messages) => {
        seen = messages;
      }),
    );
    expect(result.text).toBe('节点输出');
    expect(snapshots).toHaveLength(0);
    expect(seen).toEqual([
      { role: 'system', content: '系统' },
      { role: 'user', content: '你好' },
    ]);
  });

  it('超窗提示词头尾截断，并写 flow 场景快照', async () => {
    const snapshots: SceneContextSnapshotPayload[] = [];
    let seen: Array<{ content: string }> = [];
    const result = await llmNodeHandler.run(
      { user: `开头${'上游长文本'.repeat(5000)}结尾` },
      context(snapshots, (messages) => {
        seen = messages as Array<{ content: string }>;
      }),
    );
    expect(result.text).toBe('节点输出');
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.scene).toBe('flow_node');
    expect(snapshots[0]?.truncated).toBe(true);
    expect(seen[0]?.content).toContain('开头');
    expect(seen[0]?.content).toContain('结尾');
    expect(seen[0]?.content).toContain('上下文已截断');
    expect(snapshots[0]!.promptTokens).toBeLessThanOrEqual(snapshots[0]!.budgetTokens + 16);
  });
});
