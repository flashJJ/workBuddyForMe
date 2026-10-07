import { describe, expect, it, vi } from 'vitest';
import { AudioPlaybackQueue, type AudioPlayer, type VoiceAudioFrame } from './audio-playback-queue';

function frame(partial: Partial<VoiceAudioFrame>): VoiceAudioFrame {
  return {
    fragment: partial.fragment ?? '',
    spoken: partial.spoken ?? 'x',
    // null 是合法值（无声帧），仅 undefined 时用默认
    audio: partial.audio !== undefined ? partial.audio : 'wav',
    sampleRate: 16000,
    final: partial.final ?? false,
  };
}

/** async player 是两层 Promise，门控释放后需要两个微任务节拍泵才继续 */
async function flushTicks(n = 2): Promise<void> {
  for (let i = 0; i < n; i += 1) await Promise.resolve();
}

function makePlayer(): AudioPlayer & { played: string[]; gate: () => void } {
  let resolveCurrent: (() => void) | null = null;
  const played: string[] = [];
  return {
    played,
    gate: () => {
      resolveCurrent?.();
      resolveCurrent = null;
    },
    async play(f) {
      played.push(f.spoken);
      await new Promise<void>((resolve) => {
        resolveCurrent = resolve;
      });
    },
    cancelAll: vi.fn(() => {
      resolveCurrent?.();
      resolveCurrent = null;
    }),
  };
}

describe('AudioPlaybackQueue', () => {
  it('多帧严格串行：第二帧在第一帧播完后才开始', async () => {
    const player = makePlayer();
    const q = new AudioPlaybackQueue(player);
    q.enqueue(frame({ spoken: 'a' }));
    q.enqueue(frame({ spoken: 'b' }));
    await flushTicks();
    expect(player.played).toEqual(['a']);
    player.gate(); // a 完成
    await flushTicks();
    expect(player.played).toEqual(['a', 'b']);
    player.gate();
  });

  it('audio=null 帧不调用播放器', async () => {
    const player = makePlayer();
    const q = new AudioPlaybackQueue(player);
    q.enqueue(frame({ spoken: '', audio: null }));
    q.enqueue(frame({ spoken: 'a', final: true }));
    await flushTicks();
    player.gate();
    await flushTicks();
    expect(player.played).toEqual(['a']);
  });

  it('final 帧排空队列并回调 idle', async () => {
    const states: string[] = [];
    const player = makePlayer();
    const q = new AudioPlaybackQueue(player, (s) => states.push(s));
    q.enqueue(frame({ spoken: 'a' }));
    q.enqueue(frame({ spoken: '', audio: null, final: true }));
    await flushTicks();
    player.gate();
    await flushTicks();
    expect(states).toContain('speaking');
    expect(states.at(-1)).toBe('idle');
  });

  it('cancel 清空排队帧、调 cancelAll、回 idle；取消后新入队帧作为新轮次播放', async () => {
    const player = makePlayer();
    const states: string[] = [];
    const q = new AudioPlaybackQueue(player, (s) => states.push(s));
    q.enqueue(frame({ spoken: 'a' })); // 开始播放 a
    q.enqueue(frame({ spoken: 'b' })); // 排队
    await flushTicks();
    q.cancel();
    expect(player.cancelAll).toHaveBeenCalled();
    expect(states.at(-1)).toBe('idle');
    await flushTicks();
    player.gate();
    await flushTicks();
    expect(player.played).toEqual(['a']); // b 被丢弃

    // 新一轮：取消后入队照常工作
    q.enqueue(frame({ spoken: 'c', final: true }));
    await flushTicks();
    player.gate();
    await flushTicks();
    expect(player.played).toEqual(['a', 'c']);
  });

  it('M4 epoch：cancel 时仍在队列中的旧轮帧（含 final）全部不落播放器、不发 idle 干扰', async () => {
    const states: string[] = [];
    const player = makePlayer();
    const q = new AudioPlaybackQueue(player, (s) => states.push(s));
    q.enqueue(frame({ spoken: 'a' })); // 正在播
    q.enqueue(frame({ spoken: 'b' })); // 排队（旧轮）
    q.enqueue(frame({ spoken: '', audio: null, final: true })); // 旧轮 final
    await flushTicks();
    expect(player.played).toEqual(['a']);

    q.cancel(); // barge-in：b 与旧 final 同代际作废
    await flushTicks();
    player.gate(); // 释放 a 的等待
    await flushTicks();
    await flushTicks();
    expect(player.played).toEqual(['a']); // b 从未播放
    // cancel 自身的 idle 之后，没有旧 final 再追加状态
    expect(states.filter((s) => s === 'idle')).toHaveLength(1);
    expect(q.getEpoch()).toBe(1);

    // 新轮 final 正常发 idle
    q.enqueue(frame({ spoken: 'c' }));
    q.enqueue(frame({ spoken: '', audio: null, final: true }));
    await flushTicks();
    player.gate();
    await flushTicks();
    expect(player.played).toEqual(['a', 'c']);
    expect(states.filter((s) => s === 'idle')).toHaveLength(2);
  });
});
