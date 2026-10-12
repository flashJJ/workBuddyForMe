import { describe, expect, it } from 'vitest';
import {
  REUNION_LONG_MISS_MS,
  REUNION_MISS_MS,
  REUNION_WELCOME_MS,
  REUNION_LONG_MISS_LINE_COUNT,
  REUNION_MISS_LINE_COUNT,
  REUNION_WELCOME_LINE_COUNT,
} from '../constants/reunion';
import {
  decideReunion,
  pickReunionLineKey,
  REUNION_TIER_EXPRESSION,
} from './reunion';

const T0 = Date.UTC(2026, 9, 12, 8, 0, 0);

describe('decideReunion 久别迎接判定（G6）', () => {
  it('从未交互（新装）：不迎接，首启向导负责欢迎', () => {
    const d = decideReunion({ lastInteractionAt: null, lastGreetedInteractionAt: null, now: T0 });
    expect(d).toEqual({ greet: false, tier: null, elapsedMs: null });
  });

  it('离开不足 8h：不迎接，elapsedMs 正常给出', () => {
    const d = decideReunion({
      lastInteractionAt: T0 - REUNION_WELCOME_MS + 1000,
      lastGreetedInteractionAt: null,
      now: T0,
    });
    expect(d.greet).toBe(false);
    expect(d.tier).toBeNull();
    expect(d.elapsedMs).toBe(REUNION_WELCOME_MS - 1000);
  });

  it('8h ≤ 离开 < 24h：welcome 档', () => {
    const d = decideReunion({
      lastInteractionAt: T0 - REUNION_WELCOME_MS,
      lastGreetedInteractionAt: null,
      now: T0,
    });
    expect(d).toMatchObject({ greet: true, tier: 'welcome', elapsedMs: REUNION_WELCOME_MS });
  });

  it('24h ≤ 离开 < 72h：miss 档', () => {
    const d = decideReunion({
      lastInteractionAt: T0 - REUNION_MISS_MS,
      lastGreetedInteractionAt: null,
      now: T0,
    });
    expect(d.greet).toBe(true);
    expect(d.tier).toBe('miss');
  });

  it('离开 ≥ 72h：longMiss 档', () => {
    const d = decideReunion({
      lastInteractionAt: T0 - REUNION_LONG_MISS_MS,
      lastGreetedInteractionAt: null,
      now: T0,
    });
    expect(d.greet).toBe(true);
    expect(d.tier).toBe('longMiss');
  });

  it('同一波久别已迎接过（基线未前移）：不重复迎接', () => {
    const lastInteractionAt = T0 - REUNION_MISS_MS;
    const first = decideReunion({
      lastInteractionAt,
      lastGreetedInteractionAt: null,
      now: T0,
    });
    expect(first.greet).toBe(true);
    // 迎接后记录基线；哪怕再过去几小时且无新交互，也不再迎接
    const second = decideReunion({
      lastInteractionAt,
      lastGreetedInteractionAt: lastInteractionAt,
      now: T0 + 3 * 3600_000,
    });
    expect(second.greet).toBe(false);
    expect(second.tier).toBeNull();
  });

  it('迎接后用户回来聊过又久别（基线前移）：允许再次迎接', () => {
    const oldBase = T0 - REUNION_MISS_MS;
    // 用户回来交互，新基线为 T0 + 1h；再过 24h+
    const newBase = T0 + 3600_000;
    const d = decideReunion({
      lastInteractionAt: newBase,
      lastGreetedInteractionAt: oldBase, // 上次迎接针对的是更早的基线
      now: newBase + REUNION_MISS_MS,
    });
    expect(d.greet).toBe(true);
    expect(d.tier).toBe('miss');
  });

  it('时钟回拨（elapsed 为负）：不迎接', () => {
    const d = decideReunion({
      lastInteractionAt: T0 + 10_000,
      lastGreetedInteractionAt: null,
      now: T0,
    });
    expect(d.greet).toBe(false);
  });
});

describe('pickReunionLineKey 短句键', () => {
  it('各档 random 边界映射到合法下标', () => {
    expect(pickReunionLineKey('welcome', 0)).toBe('emotion.reunion.welcome0');
    expect(pickReunionLineKey('welcome', 0.9999)).toBe(
      `emotion.reunion.welcome${REUNION_WELCOME_LINE_COUNT - 1}`,
    );
    expect(pickReunionLineKey('miss', 0)).toBe('emotion.reunion.miss0');
    expect(pickReunionLineKey('miss', 1)).toBe(`emotion.reunion.miss${REUNION_MISS_LINE_COUNT - 1}`);
    expect(pickReunionLineKey('longMiss', 0)).toBe('emotion.reunion.longMiss0');
    expect(pickReunionLineKey('longMiss', 1)).toBe(
      `emotion.reunion.longMiss${REUNION_LONG_MISS_LINE_COUNT - 1}`,
    );
  });

  it('表情映射：welcome=joy，想念档=sadness（不用 anger）', () => {
    expect(REUNION_TIER_EXPRESSION.welcome).toBe('joy');
    expect(REUNION_TIER_EXPRESSION.miss).toBe('sadness');
    expect(REUNION_TIER_EXPRESSION.longMiss).toBe('sadness');
  });
});
