import { describe, expect, it } from 'vitest';
import { AudioDirector } from './director';
import { AUDIO_DUCK_RATIO } from './constants';

function sink() {
  const state = { gain: -1, suspended: false };
  return {
    state,
    setGain(gain: number) {
      state.gain = gain;
    },
    setSuspended(suspended: boolean) {
      state.suspended = suspended;
    },
  };
}

describe('v4.2 AudioDirector', () => {
  it('注册 sink 立即拿到当前系数', () => {
    const director = new AudioDirector();
    const music = sink();
    director.registerSink('music', music);
    expect(music.state.gain).toBe(1);
    expect(music.state.suspended).toBe(false);
  });

  it('静音把全部音轨压到 0，并同步快照', () => {
    const director = new AudioDirector();
    const music = sink();
    const voice = sink();
    director.registerSink('music', music);
    director.registerSink('voice', voice);
    director.setMuted(true);
    expect(music.state.gain).toBe(0);
    expect(voice.state.gain).toBe(0);
    expect(director.getSnapshot().muted).toBe(true);
    director.toggleMuted();
    expect(music.state.gain).toBe(1);
  });

  it('多来源语音只 duck 背景乐，语音与音效不受影响', () => {
    const director = new AudioDirector();
    const music = sink();
    const theater = sink();
    const voice = sink();
    director.registerSink('music', music);
    director.registerSink('theater-bgm', theater);
    director.registerSink('voice', voice);
    director.setVoiceActive('main', true);
    expect(music.state.gain).toBe(AUDIO_DUCK_RATIO);
    expect(theater.state.gain).toBe(AUDIO_DUCK_RATIO);
    expect(voice.state.gain).toBe(1);
    director.setVoiceActive('stage', true);
    director.setVoiceActive('main', false);
    expect(music.state.gain).toBe(AUDIO_DUCK_RATIO);
    director.setVoiceActive('stage', false);
    expect(music.state.gain).toBe(1);
    expect(director.getSnapshot().voiceActive).toBe(false);
  });

  it('背景互斥只暂停另一条背景乐', () => {
    const director = new AudioDirector();
    const music = sink();
    const theater = sink();
    director.registerSink('music', music);
    director.registerSink('theater-bgm', theater);
    director.setBackground('theater-bgm');
    expect(music.state.suspended).toBe(true);
    expect(theater.state.suspended).toBe(false);
    director.setBackground('music');
    expect(music.state.suspended).toBe(false);
    expect(theater.state.suspended).toBe(true);
    director.setBackground(null);
    expect(music.state.suspended).toBe(false);
    expect(theater.state.suspended).toBe(false);
  });

  it('音效并发最多 2 个，静音时直接拒绝', () => {
    const director = new AudioDirector();
    expect(director.tryPlaySfx()).toBe(true);
    expect(director.tryPlaySfx()).toBe(true);
    expect(director.tryPlaySfx()).toBe(false);
    director.endSfx();
    expect(director.tryPlaySfx()).toBe(true);
    director.setMuted(true);
    expect(director.tryPlaySfx()).toBe(false);
  });

  it('解锁回调全部执行，单个失败不影响其他', () => {
    const director = new AudioDirector();
    let first = 0;
    let second = 0;
    director.registerUnlock(() => {
      first += 1;
      throw new Error('no audio');
    });
    director.registerUnlock(() => {
      second += 1;
    });
    director.unlock();
    expect(first).toBe(1);
    expect(second).toBe(1);
    expect(director.getSnapshot().unlocked).toBe(true);
  });

  it('注销后不再收到状态变化', () => {
    const director = new AudioDirector();
    const music = sink();
    const unregister = director.registerSink('music', music);
    director.setMuted(true);
    expect(music.state.gain).toBe(0);
    unregister();
    director.setMuted(false);
    expect(music.state.gain).toBe(0);
  });
});
