import { describe, expect, it } from 'vitest';
import {
  PROACTIVE_MAX_PER_HOUR,
  PROACTIVE_MIN_GAP_MS,
  canProactiveSpeak,
} from '../use-proactive-chat';

const MINUTE = 60_000;
const T0 = 1_700_000_000_000;

describe('canProactiveSpeak（L3 成功搭话低频闸门）', () => {
  it('从未说过：允许', () => {
    expect(canProactiveSpeak([], T0)).toBe(true);
  });

  it('最小间隔内不允许，越过间隔后恢复', () => {
    expect(canProactiveSpeak([T0], T0 + MINUTE)).toBe(false);
    expect(canProactiveSpeak([T0], T0 + PROACTIVE_MIN_GAP_MS - 1)).toBe(false);
    expect(canProactiveSpeak([T0], T0 + PROACTIVE_MIN_GAP_MS)).toBe(true);
  });

  it('任意 1 小时窗口内不超过上限', () => {
    // 两条都落在同一小时：即使最小间隔已过，也达到每小时上限
    const spoken = [T0, T0 + PROACTIVE_MIN_GAP_MS];
    expect(canProactiveSpeak(spoken, T0 + PROACTIVE_MIN_GAP_MS * 2)).toBe(false);
  });

  it('超过 1 小时的旧时间戳不计入窗口', () => {
    const spoken = [T0 - 61 * MINUTE, T0 - 60 * MINUTE];
    expect(canProactiveSpeak(spoken, T0)).toBe(true);
  });
});
