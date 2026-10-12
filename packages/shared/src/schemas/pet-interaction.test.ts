import { describe, expect, it } from 'vitest';
import {
  HEAD_TOUCH_DEBOUNCE_MS,
  HEAD_TOUCH_PROTECT_MS,
  HEAD_TOUCH_TRIGGER_COUNT,
  HEAD_TOUCH_WINDOW_MS,
  TOUCH_LINE_COOLDOWN_MS,
  TOUCH_LINE_DAILY_CAP,
  TOUCH_LINE_PROBABILITY,
  TOUCH_BLUSH_EXPRESSION,
  TOUCH_PROTECT_EXPRESSION,
} from '../constants/pet-interaction';
import {
  createTouchState,
  localDateKey,
  pickTouchLineKey,
  registerHeadTouch,
} from './pet-interaction';

const T0 = 1_000_000;
const DAY = '2026-10-12';
/** 固定命中短句概率的随机数（小于概率即命中） */
const HIT_RANDOM = 0;
const MISS_RANDOM = 0.99;

describe('registerHeadTouch 触摸状态机', () => {
  it('首次触摸：害羞反应、接受、不在保护期', () => {
    const outcome = registerHeadTouch(createTouchState(T0, DAY), T0, DAY, MISS_RANDOM);
    expect(outcome.accepted).toBe(true);
    expect(outcome.reaction).toBe('blush');
    expect(outcome.expression).toBe(TOUCH_BLUSH_EXPRESSION);
    expect(outcome.inProtection).toBe(false);
  });

  it('防抖：窗口内过近的第二次触摸被拒绝且不改状态', () => {
    const first = registerHeadTouch(createTouchState(T0, DAY), T0, DAY, MISS_RANDOM);
    const second = registerHeadTouch(
      first.next,
      T0 + HEAD_TOUCH_DEBOUNCE_MS - 10,
      DAY,
      MISS_RANDOM,
    );
    expect(second.accepted).toBe(false);
    expect(second.next).toBe(first.next);
  });

  it(`窗口内连摸 ${HEAD_TOUCH_TRIGGER_COUNT} 次进入保护期：抗议表情，窗口计数清零`, () => {
    let state = createTouchState(T0, DAY);
    // 第 1 次在窗口起点（计数 1），第 2 次 +1000，第 3 次由 triggered 显式断言
    const first = registerHeadTouch(state, T0, DAY, MISS_RANDOM);
    expect(first.reaction).toBe('blush');
    state = first.next;
    const second = registerHeadTouch(state, T0 + 1000, DAY, MISS_RANDOM);
    expect(second.reaction).toBe('blush');
    state = second.next;
    const triggered = registerHeadTouch(state, T0 + 2000, DAY, MISS_RANDOM);
    expect(triggered.reaction).toBe('protect');
    expect(triggered.expression).toBe(TOUCH_PROTECT_EXPRESSION);
    expect(triggered.inProtection).toBe(true);
    expect(triggered.enteredProtection).toBe(true);
    expect(triggered.speakLine).toBe(false);
    expect(triggered.next.protectedUntil).toBe(
      T0 + (HEAD_TOUCH_TRIGGER_COUNT - 1) * 1000 + HEAD_TOUCH_PROTECT_MS,
    );
  });

  it('保护期内触摸持续抗议但不延期', () => {
    let state = createTouchState(T0, DAY);
    state = registerHeadTouch(state, T0, DAY, MISS_RANDOM).next;
    state = registerHeadTouch(state, T0 + 1000, DAY, MISS_RANDOM).next;
    // 第三次连摸进入保护期
    const entered = registerHeadTouch(state, T0 + 2000, DAY, MISS_RANDOM);
    expect(entered.inProtection).toBe(true);
    state = entered.next;

    // 保护期内再摸：持续抗议
    const inProtect = registerHeadTouch(state, T0 + 3000, DAY, MISS_RANDOM);
    expect(inProtect.reaction).toBe('protect');
    expect(inProtect.inProtection).toBe(true);
    // 保护期内的持续触摸不算「新进入」
    expect(inProtect.enteredProtection).toBe(false);
    // 不延期：protectedUntil 保持进入时的值
    expect(inProtect.next.protectedUntil).toBe(state.protectedUntil);
  });

  it('窗口过期后重新计数（不进保护期）', () => {
    let state = createTouchState(T0, DAY);
    state = registerHeadTouch(state, T0, DAY, MISS_RANDOM).next;
    state = registerHeadTouch(state, T0 + 1000, DAY, MISS_RANDOM).next;
    // 第三次发生在窗口之外，计数重新从 1 开始
    const late = registerHeadTouch(
      state,
      T0 + 1000 + HEAD_TOUCH_WINDOW_MS + 1,
      DAY,
      MISS_RANDOM,
    );
    expect(late.next.windowCount).toBe(1);
    expect(late.reaction).toBe('blush');
    expect(late.inProtection).toBe(false);
  });

  it('保护期结束后触摸恢复害羞反应', () => {
    let state = createTouchState(T0, DAY);
    state = registerHeadTouch(state, T0, DAY, MISS_RANDOM).next;
    state = registerHeadTouch(state, T0 + 1000, DAY, MISS_RANDOM).next;
    state = registerHeadTouch(state, T0 + 2000, DAY, MISS_RANDOM).next;
    const after = registerHeadTouch(
      state,
      T0 + 2000 + HEAD_TOUCH_PROTECT_MS + 1,
      DAY,
      MISS_RANDOM,
    );
    expect(after.reaction).toBe('blush');
    expect(after.inProtection).toBe(false);
  });
});

describe('本地短句节流', () => {
  it('随机命中且无冷却时允许短句', () => {
    const outcome = registerHeadTouch(createTouchState(T0, DAY), T0, DAY, HIT_RANDOM);
    expect(outcome.speakLine).toBe(true);
    expect(outcome.next.lineCount).toBe(1);
  });

  it('随机未命中不说话、不计数', () => {
    const outcome = registerHeadTouch(createTouchState(T0, DAY), T0, DAY, MISS_RANDOM);
    expect(outcome.speakLine).toBe(false);
    expect(outcome.next.lineCount).toBe(0);
  });

  it('冷却期内即使命中也不重复说', () => {
    let state = registerHeadTouch(createTouchState(T0, DAY), T0, DAY, HIT_RANDOM).next;
    state = registerHeadTouch(
      state,
      T0 + HEAD_TOUCH_DEBOUNCE_MS + 1,
      DAY,
      HIT_RANDOM,
    ).next;
    expect(state.lineCount).toBe(1);
    const soon = registerHeadTouch(
      state,
      T0 + TOUCH_LINE_COOLDOWN_MS - 1000,
      DAY,
      HIT_RANDOM,
    );
    expect(soon.speakLine).toBe(false);
  });

  it(`每日上限 ${TOUCH_LINE_DAILY_CAP} 条后不再说（保护期触摸不计数说话）`, () => {
    let state = createTouchState(T0, DAY);
    let spoken = 0;
    // 大步长（超过短句冷却）连摸 30 次，随机恒定命中；其中连摸触发的保护期触摸不说
    for (let i = 0; i < 30; i += 1) {
      const outcome = registerHeadTouch(
        state,
        T0 + i * (TOUCH_LINE_COOLDOWN_MS + 1000),
        DAY,
        HIT_RANDOM,
      );
      if (outcome.speakLine) spoken += 1;
      state = outcome.next;
    }
    expect(state.lineCount).toBe(TOUCH_LINE_DAILY_CAP);
    expect(spoken).toBe(TOUCH_LINE_DAILY_CAP);
    const overflow = registerHeadTouch(
      state,
      T0 + 31 * (TOUCH_LINE_COOLDOWN_MS + 1000),
      DAY,
      HIT_RANDOM,
    );
    expect(overflow.speakLine).toBe(false);
  });

  it('跨自然日重置计数与冷却', () => {
    let state = createTouchState(T0, DAY);
    state = registerHeadTouch(state, T0, DAY, HIT_RANDOM).next;
    expect(state.lineCount).toBe(1);
    const nextDay = registerHeadTouch(state, T0 + 86_400_000, '2026-10-13', HIT_RANDOM);
    expect(nextDay.speakLine).toBe(true);
    expect(nextDay.next.lineDate).toBe('2026-10-13');
    expect(nextDay.next.lineCount).toBe(1);
  });

  it('概率边界：恰好等于概率值不命中（< 才命中）', () => {
    const outcome = registerHeadTouch(
      createTouchState(T0, DAY),
      T0,
      DAY,
      TOUCH_LINE_PROBABILITY,
    );
    expect(outcome.speakLine).toBe(false);
  });
});

describe('localDateKey / pickTouchLineKey', () => {
  it('localDateKey 为本地 YYYY-MM-DD', () => {
    expect(localDateKey(new Date(2026, 9, 12, 23).getTime())).toBe('2026-10-12');
  });

  it('选句键落在各自词池范围内', () => {
    for (let i = 0; i < 6; i += 1) {
      const key = pickTouchLineKey('blush', i / 6);
      expect(key).toMatch(/^emotion\.touch\.blush[0-5]$/);
    }
    for (let i = 0; i < 4; i += 1) {
      expect(pickTouchLineKey('protect', i / 4)).toMatch(/^emotion\.touch\.protect[0-3]$/);
    }
    // 越界随机数被夹回最后一条
    expect(pickTouchLineKey('blush', 1)).toBe('emotion.touch.blush5');
    expect(pickTouchLineKey('protect', 0.999)).toBe('emotion.touch.protect3');
  });
});
