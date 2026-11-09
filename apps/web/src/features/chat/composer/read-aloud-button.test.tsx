// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Message } from '@wbfm/shared/types';
import { renderWithProviders } from '@/test/render';
import type { VoicePlayback } from '@/features/voice/runtime';
import { ReadAloudButton } from './read-aloud-button';

vi.mock('@/features/events/ui', () => ({
  wavToVoiceFrame: () => ({
    fragment: 'x',
    spoken: 'x',
    audio: 'AA==',
    sampleRate: 24000,
    final: true,
  }),
}));

function assistantMessage(content: string): Message {
  return {
    id: 'm1',
    conversationId: 'c1',
    role: 'assistant',
    content,
    contentParts: [],
    status: 'completed',
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    citations: [],
    toolTrace: [],
    feedback: null,
    feedbackAt: null,
    errorCode: null,
    errorMessage: null,
    createdAt: '2025-01-01T00:00:00.000Z',
  };
}

function fakePlayback(overrides: Partial<VoicePlayback> = {}): VoicePlayback {
  return {
    enqueue: vi.fn(),
    cancel: vi.fn(),
    waitDrained: vi.fn(async () => undefined),
    getLevel: () => 0,
    getGate: () => ({ speaking: false, inCooldown: false }),
    voiceState: 'idle',
    speaking: false,
    subscribeLevel: () => () => undefined,
    ...overrides,
  } as VoicePlayback;
}

/** 排空等待挂起直到 abort，模拟真实播放队列（便于验证取消路径） */
const pendingDrain = () =>
  vi.fn(
    (signal?: AbortSignal) =>
      new Promise<void>((resolve) => {
        signal?.addEventListener('abort', () => resolve(), { once: true });
      }),
  );

describe('会话下栏朗读按钮（v2.35）', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('无助手回复时禁用并提示暂无可朗读内容', () => {
    renderWithProviders(
      <ReadAloudButton
        messages={[]}
        ttsReady
        playback={fakePlayback()}
        conversationId={null}
      />,
    );
    const button = screen.getByTestId('read-aloud-button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-label', '暂无可朗读的回复');
  });

  it('语音模型未就绪时禁用', () => {
    renderWithProviders(
      <ReadAloudButton
        messages={[assistantMessage('你好')]}
        ttsReady={false}
        playback={fakePlayback()}
        conversationId="c1"
      />,
    );
    const button = screen.getByTestId('read-aloud-button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-label', '语音模型未就绪，无法朗读');
  });

  it('点击开始朗读：请求 TTS 并投喂共享播放队列，再次点击取消', async () => {
    const fetchMock = vi.fn(async () => new Response('wav', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const playback = fakePlayback({ waitDrained: pendingDrain() });
    const user = userEvent.setup();
    renderWithProviders(
      <ReadAloudButton
        messages={[assistantMessage('## 标题\n\n这是**正文**。')]}
        ttsReady
        speakerId={3}
        playback={playback}
        conversationId="c1"
      />,
    );

    await user.click(screen.getByTestId('read-aloud-button'));
    await waitFor(() => expect(playback.enqueue).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/voice/tts');
    expect(JSON.parse(String(init.body))).toMatchObject({ text: '标题 这是正文。', speakerId: 3 });
    expect(screen.getByTestId('read-aloud-button')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByTestId('read-aloud-button'));
    expect(playback.cancel).toHaveBeenCalled();
    expect(screen.getByTestId('read-aloud-button')).toHaveAttribute('aria-pressed', 'false');
  });
});
