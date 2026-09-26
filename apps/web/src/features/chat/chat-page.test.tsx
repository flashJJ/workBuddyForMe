// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Assistant, Conversation, Provider, ProviderModel } from '@wbfm/shared';
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
  memoryEnabled: true,
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

const COMPACTED_CONVERSATION: Conversation = {
  id: 'c1',
  assistantId: 'a1',
  title: '长对话',
  summary: '用户偏好中文回复；正在筹备周末露营。',
  summaryTurns: 6,
  lastMessageAt: '2025-01-02T00:00:00.000Z',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
};

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

  it('v0.5：会话已压缩时头部显示徽标，点击弹窗展示摘要正文', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/chat/stream') {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const frames = [
              'event: meta\ndata: {"messageId":"m10","conversationId":"c1"}\n\n',
              'event: delta\ndata: {"content":"好的"}\n\n',
              'event: done\ndata: {"content":"好的","usage":null}\n\n',
            ];
            for (const frame of frames) controller.enqueue(encoder.encode(frame));
            controller.close();
          },
        });
        return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
      }
      let data: unknown = [];
      if (url === '/api/assistants') data = [ASSISTANT];
      else if (url === '/api/settings')
        data = { defaultChatModelId: 'm1', defaultEmbeddingModelId: null, theme: 'light', language: 'zh-CN' };
      else if (url === '/api/providers') data = [PROVIDER];
      else if (url === '/api/providers/p1/models') data = [MODEL];
      else if (url.startsWith('/api/conversations?')) data = [COMPACTED_CONVERSATION];
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { 'content-type': 'application/json' },
      });
    });

    const user = userEvent.setup();
    renderWithProviders(<ChatPage />);

    const input = await screen.findByLabelText('消息输入框');
    await user.type(input, '继续');
    await user.click(screen.getByRole('button', { name: '发送消息' }));

    const badge = await screen.findByTestId('compaction-badge');
    expect(badge).toHaveTextContent('已压缩 6 条早期消息');
    await user.click(badge);
    expect(await screen.findByTestId('conversation-summary-text')).toHaveTextContent(
      '用户偏好中文回复；正在筹备周末露营。',
    );
  });
});
