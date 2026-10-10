// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { VadMonitorOptions } from './vad/use-vad-monitor';
import type { VoicePlayback } from './use-voice-playback';

const { monitorRef } = vi.hoisted(() => ({ monitorRef: { current: null as VadMonitorOptions | null } }));

vi.mock('./vad/use-vad-monitor', () => ({
  useVadMonitor: (opts: VadMonitorOptions) => {
    monitorRef.current = opts;
    return { phase: 'on' as const, error: null, clearError: vi.fn() };
  },
}));

const apiUpload = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({
  apiUpload: (...args: unknown[]) => apiUpload(...args),
}));
vi.mock('@/lib/api/endpoints', () => ({ API: { voiceAsr: '/api/voice/asr' } }));
vi.mock('@/lib/i18n/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'zh-CN' }),
}));

import { useHandsfreeVoice } from './use-handsfree-voice';

function makePlayback(speaking: boolean): VoicePlayback {
  return {
    enqueue: vi.fn(),
    cancel: vi.fn(),
    getLevel: vi.fn(() => 0),
    getGate: vi.fn(() => ({ speaking, inCooldown: false })),
    subscribeLevel: vi.fn(() => () => undefined),
    voiceState: speaking ? 'speaking' : 'idle',
    speaking,
  };
}

const silencePcm = new Float32Array(512).fill(0.01);

function renderHand(overrides?: Partial<Parameters<typeof useHandsfreeVoice>[0]>) {
  const onRecognizedSend = vi.fn();
  const onAbortTurn = vi.fn();
  const playback = makePlayback(false);
  const utils = renderHook(() =>
    useHandsfreeVoice({
      asrReady: true,
      canArm: true,
      sensitivity: 'balanced',
      silenceMs: 900,
      playback,
      onRecognizedSend,
      onAbortTurn,
      ...overrides,
    }),
  );
  return { ...utils, onRecognizedSend, onAbortTurn, playback };
}

beforeEach(() => {
  vi.clearAllMocks();
  monitorRef.current = null;
});

describe('useHandsfreeVoice', () => {
  it('语音段 → ASR → 自动发送识别文本', async () => {
    apiUpload.mockResolvedValueOnce({ text: '你好世界' });
    const h = renderHand();

    await act(async () => {
      monitorRef.current?.onSegment(silencePcm);
    });

    await waitFor(() => expect(h.onRecognizedSend).toHaveBeenCalledWith('你好世界'));
    expect(apiUpload).toHaveBeenCalledTimes(1);
    expect(h.result.current.voiceState).toBe('idle');
  });

  it('空识别不发送', async () => {
    apiUpload.mockResolvedValueOnce({ text: '   ' });
    const h = renderHand();
    await act(async () => {
      monitorRef.current?.onSegment(silencePcm);
    });
    await waitFor(() => expect(apiUpload).toHaveBeenCalledTimes(1));
    expect(h.onRecognizedSend).not.toHaveBeenCalled();
  });

  it('speech-start 撞播放态：barge-in 停播放并 abort 当前轮次', () => {
    const playback = makePlayback(true);
    const h = renderHand({ playback });
    act(() => {
      monitorRef.current?.onVadEvent?.('speech-start');
    });
    expect(playback.cancel).toHaveBeenCalledTimes(1);
    expect(h.onAbortTurn).toHaveBeenCalledTimes(1);
    // 真实环境 cancel 触发重渲染后 playback.speaking 变 false，合并态即 listening；
    // 静态 mock 不模拟重渲染，这里只验证打断动作与门控来源
    expect(playback.getGate).toHaveBeenCalled();
  });

  it('speech-start 在空闲态：只切 listening，不打断', () => {
    const h = renderHand();
    act(() => {
      monitorRef.current?.onVadEvent?.('speech-start');
    });
    expect(h.playback.cancel).not.toHaveBeenCalled();
    expect(h.onAbortTurn).not.toHaveBeenCalled();
    expect(h.result.current.voiceState).toBe('listening');
  });

  it('单飞+单槽：识别中到达的第二段排队，识别完成后自动补发一次', async () => {
    apiUpload
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ text: '第一句' }), 20)),
      )
      .mockResolvedValueOnce({ text: '第二句' });
    const h = renderHand();

    await act(async () => {
      void monitorRef.current?.onSegment(silencePcm);
      monitorRef.current?.onSegment(new Float32Array(512).fill(0.02)); // 忙时入队
    });

    await waitFor(() => expect(h.onRecognizedSend).toHaveBeenCalledTimes(2));
    expect(h.onRecognizedSend.mock.calls.map((c) => c[0])).toEqual(['第一句', '第二句']);
    expect(apiUpload).toHaveBeenCalledTimes(2);
  });
});
