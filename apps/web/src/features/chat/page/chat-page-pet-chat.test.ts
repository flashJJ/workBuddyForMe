// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ChatPage } from './chat-page';

/**
 * jsdom 下全局 fetch 与 msw 拦截器（undici Request 的 AbortSignal 校验）不兼容，
 * 页面级用例改在 api 客户端边界注入响应；网络断言由下游 hook 单测覆盖。
 */
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  const { ASSISTANT, MODEL, PROVIDER } = await import('./test-fixtures');
  return {
    ...actual,
    apiGet: vi.fn(async (path: string) => {
      if (path === '/api/assistants') return [ASSISTANT];
      if (path === '/api/settings')
        return { defaultChatModelId: 'm1', defaultEmbeddingModelId: null, theme: 'light', language: 'zh-CN' };
      if (path === '/api/providers') return [PROVIDER];
      if (path === '/api/providers/p1/models') return [MODEL];
      if (path.startsWith('/api/events/usage')) return { assistantId: 'a1', dateKey: '', items: [] };
      return [];
    }),
    apiSend: vi.fn(async () => ({})),
    apiPost: vi.fn(async () => ({})),
    apiPut: vi.fn(async () => ({})),
    apiPatch: vi.fn(async () => ({})),
    apiDelete: vi.fn(async () => ({})),
    apiUpload: vi.fn(async () => ({})),
  };
});

describe('对话页 · 桌宠发起聊天', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('只预填草稿并聚焦，不自动发送', async () => {
    let emit: ((key: string) => void) | null = null;
    const petStub = new Proxy(
      {
        isOpen: () => Promise.resolve(false),
        onChatRequest: (cb: (key: string) => void) => {
          emit = cb;
          return () => {
            emit = null;
          };
        },
      } as Record<string, unknown>,
      {
        get(target, prop) {
          if (prop in target) return target[prop as string];
          return () => () => undefined;
        },
      },
    );
    vi.stubGlobal('wbfm', { pet: petStub });

    renderWithProviders(React.createElement(ChatPage));
    const input = await screen.findByLabelText('消息输入框');
    await waitFor(() => expect(emit).not.toBeNull());

    act(() => emit?.('greet'));

    await waitFor(() => expect(input).toHaveValue('今天过得怎么样？'));
    expect(document.querySelectorAll('[data-testid^="message-"]')).toHaveLength(0);
  });
});
