import { describe, expect, it } from 'vitest';
import { isVoiceTransitionAllowed, nextVoiceState } from './voice-state';

describe('nextVoiceState 正常对话路径', () => {
  it('语音输入路径 idle→listening→thinking→speaking→idle', () => {
    let t = nextVoiceState('idle', 'listen_start');
    expect(t).toMatchObject({ state: 'listening', changed: true, illegal: false });
    t = nextVoiceState(t.state, 'listen_end');
    expect(t.state).toBe('thinking');
    t = nextVoiceState(t.state, 'speech_start');
    expect(t.state).toBe('speaking');
    t = nextVoiceState(t.state, 'speech_end');
    expect(t).toMatchObject({ state: 'idle', changed: true });
  });

  it('纯文字输入可从 idle 直接进入 thinking', () => {
    expect(nextVoiceState('idle', 'llm_start').state).toBe('thinking');
  });

  it('listening 阶段也允许 llm_start（静音超时后手动发送文本）', () => {
    expect(nextVoiceState('listening', 'llm_start').state).toBe('thinking');
  });
});

describe('打断（半双工 barge-in）', () => {
  it('speaking 中 listen_start 合法——打断后回到 listening', () => {
    expect(isVoiceTransitionAllowed('speaking', 'listen_start')).toBe(true);
    expect(nextVoiceState('speaking', 'listen_start')).toMatchObject({
      state: 'listening',
      illegal: false,
    });
  });

  it('speaking 中不能直接 listen_end（没在听就无所谓说完）', () => {
    expect(isVoiceTransitionAllowed('speaking', 'listen_end')).toBe(false);
    const t = nextVoiceState('speaking', 'listen_end');
    expect(t).toMatchObject({ state: 'speaking', changed: false, illegal: true });
  });
});

describe('cancel / error 任意状态回 idle', () => {
  for (const state of ['idle', 'listening', 'thinking', 'speaking'] as const) {
    it(`cancel 在 ${state} 状态安全`, () => {
      const t = nextVoiceState(state, 'cancel');
      expect(t.state).toBe('idle');
      expect(t.illegal).toBe(false);
    });
    it(`error 在 ${state} 状态安全`, () => {
      expect(nextVoiceState(state, 'error').state).toBe('idle');
    });
  }

  it('idle 下 cancel 不标记 changed（避免无谓渲染）', () => {
    expect(nextVoiceState('idle', 'cancel').changed).toBe(false);
  });
});
