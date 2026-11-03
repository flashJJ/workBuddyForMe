// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Assistant, Conversation, ProviderModel } from '@wbfm/shared/types';
import { useChatModelView } from './use-chat-model-view';

const MODEL_A: ProviderModel = {
  id: 'm-a',
  providerId: 'p1',
  modelId: 'chat-a',
  displayName: 'A',
  capabilities: ['chat', 'vision'],
  contextWindow: null,
  createdAt: '',
};
const MODEL_B: ProviderModel = {
  id: 'm-b',
  providerId: 'p1',
  modelId: 'chat-b',
  displayName: 'B',
  capabilities: ['chat'],
  contextWindow: null,
  createdAt: '',
};

const ASSISTANT = {
  id: 'a1',
  name: 'A',
  modelId: 'm-b',
  cardId: null,
  stagePlan: null,
  isBuiltin: true,
} as unknown as Assistant;

function conversation(modelId: string | null): Conversation {
  return {
    id: 'c1',
    assistantId: 'a1',
    title: 'T',
    modelId,
    summary: null,
    summaryTurns: 0,
    lastMessageAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

describe('v2.20 M5 生效模型视图', () => {
  it('会话覆盖优先于助手绑定；vision 跟随会话模型', () => {
    const { result } = renderHook(() =>
      useChatModelView({
        assistant: ASSISTANT,
        conversation: conversation('m-a'),
        defaultChatModelId: 'm-b',
        models: [MODEL_A, MODEL_B],
      }),
    );
    expect(result.current.effectiveModelId).toBe('m-a');
    expect(result.current.hasChatModel).toBe(true);
    expect(result.current.visionEnabled).toBe(true);
  });

  it('会话未覆盖时回落助手绑定', () => {
    const { result } = renderHook(() =>
      useChatModelView({
        assistant: ASSISTANT,
        conversation: conversation(null),
        defaultChatModelId: 'm-a',
        models: [MODEL_A, MODEL_B],
      }),
    );
    expect(result.current.effectiveModelId).toBe('m-b');
    expect(result.current.visionEnabled).toBe(false);
  });
});
