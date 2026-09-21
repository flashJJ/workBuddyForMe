// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Assistant, Provider, ProviderModel } from '@wbfm/shared';
import { renderWithProviders } from '@/test/render';
import { ChatPage } from './chat-page';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const ASSISTANT: Assistant = {
  id: 'a1',
  name: '通用助手',
  emoji: '🤖',
  color: null,
  systemPrompt: '',
  temperature: 1,
  topP: 1,
  maxTokens: null,
  modelId: null,
  knowledgeBaseId: null,
  enabledTools: [],
  retrieveAlways: false,
  isBuiltin: true,
  sortOrder: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const PROVIDER: Provider = {
  id: 'p1',
  name: 'P',
  protocol: 'openai-compatible',
  baseUrl: 'https://x/v1',
  apiKeyMasked: null,
  enabled: true,
  sortOrder: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const MODEL: ProviderModel = {
  id: 'm1',
  providerId: 'p1',
  modelId: 'gpt-mini',
  displayName: 'GPT mini',
  capabilities: ['chat'],
  contextWindow: null,
  createdAt: '2025-01-01T00:00:00.000Z',
};

const encoder = new TextEncoder();

describe('对话页（TR-27.1）', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('未配置对话模型时展示设置引导', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const data =
        url === '/api/assistants'
          ? [ASSISTANT]
          : url === '/api/settings'
            ? { defaultChatModelId: null, defaultEmbeddingModelId: null, theme: 'light', language: 'zh-CN' }
            : [];
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { 'content-type': 'application/json' },
      });
    });
    renderWithProviders(<ChatPage />);

    expect(await screen.findByRole('link', { name: '前往设置' })).toHaveAttribute('href', '/settings');
  });

  it('端到端：发送消息后渲染用户气泡与流式回复，并自动归入新会话', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/chat/stream') {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const frames = [
              'event: meta\ndata: {"messageId":"m9","conversationId":"c9"}\n\n',
              'event: delta\ndata: {"content":"你好呀"}\n\n',
              'event: done\ndata: {"content":"你好呀","usage":null}\n\n',
            ];
            for (const frame of frames) controller.enqueue(encoder.encode(frame));
            controller.close();
          },
        });
        return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
      }
      const data =
        url === '/api/assistants'
          ? [ASSISTANT]
          : url === '/api/settings'
            ? { defaultChatModelId: 'm1', defaultEmbeddingModelId: null, theme: 'light', language: 'zh-CN' }
            : url === '/api/providers'
              ? [PROVIDER]
              : url === '/api/providers/p1/models'
                ? [MODEL]
                : [];
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { 'content-type': 'application/json' },
      });
    });

    const user = userEvent.setup();
    renderWithProviders(<ChatPage />);

    const input = await screen.findByLabelText('消息输入框');
    await user.type(input, '在吗');
    await user.click(screen.getByRole('button', { name: '发送消息' }));

    await waitFor(() => expect(screen.getByText('你好呀')).toBeInTheDocument());
    expect(screen.getByText('在吗')).toBeInTheDocument();
    const streamCall = vi.mocked(fetch).mock.calls.find((call) => String(call[0]) === '/api/chat/stream');
    expect(streamCall).toBeDefined();
  });
});
