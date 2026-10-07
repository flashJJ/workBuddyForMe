import { describe, expect, it, vi } from 'vitest';
import type { OrchestratorEvent } from '@wbfm/core';
import { withVoice, type VoiceBridgeEvent } from './voice-chat-bridge';

type Synth = (text: string) => Promise<{ samples: Float32Array; sampleRate: number }>;

async function collect(events: OrchestratorEvent[], synth?: Synth) {
  async function* source(): AsyncGenerator<OrchestratorEvent> {
    for (const e of events) yield e;
  }
  const tts = {
    synthesize:
      synth ??
      (async () => ({ samples: new Float32Array([0.1]), sampleRate: 16000 })),
  };
  const out: VoiceBridgeEvent[] = [];
  for await (const e of withVoice(source(), { tts })) out.push(e);
  return out;
}

describe('withVoice 语音桥', () => {
  it('增量 delta：首逗号快出，事件夹在文本流之间且收尾有终态帧', async () => {
    const events = await collect([
      { event: 'meta', data: { messageId: 'm1', conversationId: 'c1' } },
      { event: 'delta', data: { content: '你好呀，' } },
      { event: 'delta', data: { content: '今天天气不错。' } },
      { event: 'done', data: { content: '你好呀，今天天气不错。', usage: null } },
    ]);

    const kinds = events.map((e) => e.event);
    // 第一段语音帧出现在第一个 delta 之后、done 之前
    const firstAudio = kinds.indexOf('voice_audio');
    expect(firstAudio).toBeGreaterThan(kinds.indexOf('delta'));
    expect(kinds.indexOf('done')).toBeGreaterThan(firstAudio);

    // 两段真实音频 + 一个终态空帧
    const audioEvents = events.filter((e) => e.event === 'voice_audio');
    expect(audioEvents.length).toBe(3);
    expect(audioEvents[0]?.event).toBe('voice_audio');
    expect((audioEvents[2]?.data as { final: boolean }).final).toBe(true);

    // 首个片段有 base64 音频
    const first = audioEvents[0]!.data as { spoken: string; audio: string | null };
    expect(first.spoken).toBe('你好呀，');
    expect(first.audio).toBeTruthy();

    // 状态 speaking→idle
    expect(kinds).toContain('voice_state');
    const states = events.filter((e) => e.event === 'voice_state').map((e) => (e.data as { state: string }).state);
    expect(states[0]).toBe('speaking');
    expect(states.at(-1)).toBe('idle');

    // 原始事件全部保留
    expect(kinds).toContain('meta');
    expect(kinds.filter((k) => k === 'done')).toHaveLength(1);
  });

  it('全文式 delta（非流式 fallback）也能正确差分，不重复朗读', async () => {
    const synth = vi.fn(async () => ({ samples: new Float32Array([0.1]), sampleRate: 16000 }));
    const events = await collect(
      [
        { event: 'delta', data: { content: '好的。' } },
        { event: 'done', data: { content: '好的。', usage: null } },
      ],
      synth,
    );
    const spoken = events
      .filter((e) => e.event === 'voice_audio')
      .map((e) => (e.data as { spoken: string }).spoken)
      .filter(Boolean);
    expect(spoken).toEqual(['好的。']);
  });

  it('纯表情标签片段：audio=null 仅驱动字幕', async () => {
    const events = await collect([
      { event: 'delta', data: { content: '[joy]' } },
      { event: 'done', data: { content: '[joy]', usage: null } },
    ]);
    const audio = events.filter((e) => e.event === 'voice_audio').map((e) => e.data as {
      spoken: string;
      audio: string | null;
    });
    expect(audio[0]).toMatchObject({ spoken: '', audio: null });
  });

  it('TTS 单句抛错：降级为字幕帧且不影响后续文本事件', async () => {
    async function* source(): AsyncGenerator<OrchestratorEvent> {
      yield { event: 'delta', data: { content: '你好。' } };
      yield { event: 'done', data: { content: '你好。', usage: null } };
    }
    const out: VoiceBridgeEvent[] = [];
    const tts = {
      synthesize: async () => {
        throw new Error('engine down');
      },
    };
    for await (const e of withVoice(source(), { tts })) out.push(e);
    const firstAudio = out.find((e) => e.event === 'voice_audio');
    expect(firstAudio?.data).toMatchObject({ audio: null, spoken: '你好。' });
    expect(out.map((e) => e.event)).toContain('done');
  });
});
