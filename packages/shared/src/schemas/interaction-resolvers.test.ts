import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DO_NOT_DISTURB,
  isDoNotDisturbHour,
  RELATIONSHIP_LEVEL_NAMES,
  relationshipLevelName,
  resolveInteraction,
  touchTriggerKey,
  type ResolverContext,
} from './interaction-resolvers';

function baseContext(overrides: Partial<ResolverContext> = {}): ResolverContext {
  return {
    hour: 12,
    capabilities: { hasTapClip: true, hasSpringBone: false },
    relationshipLevel: 'partner',
    emotionEnabled: true,
    doNotDisturb: DEFAULT_DO_NOT_DISTURB,
    ...overrides,
  };
}

describe('relationshipLevelName（展示数值等级 → 门控等级名）', () => {
  it('0–3 一一对应（顺序与 relationshipLevelSchema 一致）', () => {
    expect(RELATIONSHIP_LEVEL_NAMES).toEqual(['stranger', 'acquaintance', 'partner', 'intimate']);
    expect(relationshipLevelName(0)).toBe('stranger');
    expect(relationshipLevelName(1)).toBe('acquaintance');
    expect(relationshipLevelName(2)).toBe('partner');
    expect(relationshipLevelName(3)).toBe('intimate');
  });

  it('越界夹紧、非整数四舍五入、非有限值回落陌生', () => {
    expect(relationshipLevelName(-1)).toBe('stranger');
    expect(relationshipLevelName(99)).toBe('intimate');
    expect(relationshipLevelName(1.6)).toBe('partner');
    expect(relationshipLevelName(Number.NaN)).toBe('stranger');
    expect(relationshipLevelName(Number.POSITIVE_INFINITY)).toBe('stranger');
  });
});

describe('touchTriggerKey 与按手势冷却（v2.2 手势补齐）', () => {
  it('键格式为 touch::region::gesture', () => {
    expect(touchTriggerKey('body', 'double')).toBe('touch::body::double');
    expect(touchTriggerKey('head', 'tap')).toBe('touch::head::tap');
  });

  it('给常见手势都配有动作链（tap / longpress / double）', () => {
    expect(resolveInteraction({ kind: 'touch', region: 'head', gesture: 'tap' }, baseContext())).not.toBeNull();
    expect(
      resolveInteraction({ kind: 'touch', region: 'body', gesture: 'double' }, baseContext()),
    ).not.toBeNull();
  });

  it('双击不被单击冷却吃掉（不同手势各自计时）', () => {
    const ctx = baseContext({
      lastTriggerAt: { [touchTriggerKey('body', 'tap')]: Date.now() },
    });
    // body tap 刚触发过 → 被 body 冷却挡住
    expect(resolveInteraction({ kind: 'touch', region: 'body', gesture: 'tap' }, ctx)).toBeNull();
    // body double 有自己的冷却键 → 不受 body tap 影响，正常放行
    const chain = resolveInteraction({ kind: 'touch', region: 'body', gesture: 'double' }, ctx);
    expect(chain).not.toBeNull();
    expect(chain?.actions.some((action) => action.type === 'controller.tap')).toBe(true);
    // 双击必经单击：这里不得再触发 squash，否则包络重置会抖动
    expect(chain?.actions.some((action) => action.type === 'controller.playSquash')).toBe(false);
  });

  it('关系门槛：陌生人长按头部被拒（head::longpress 需 acquaintance）', () => {
    const ctx = baseContext({ relationshipLevel: 'stranger' });
    expect(resolveInteraction({ kind: 'touch', region: 'head', gesture: 'longpress' }, ctx)).toBeNull();
  });
});

describe('勿扰时段可配置（v2.2：替换硬编码 23:00–06:00）', () => {
  it('缺省 23:00–06:00 为跨零点窗口（含起、不含止）', () => {
    expect(DEFAULT_DO_NOT_DISTURB).toEqual({ enabled: true, startHour: 23, endHour: 6 });
    expect(isDoNotDisturbHour(23, DEFAULT_DO_NOT_DISTURB)).toBe(true);
    expect(isDoNotDisturbHour(0, DEFAULT_DO_NOT_DISTURB)).toBe(true);
    expect(isDoNotDisturbHour(5, DEFAULT_DO_NOT_DISTURB)).toBe(true);
    expect(isDoNotDisturbHour(6, DEFAULT_DO_NOT_DISTURB)).toBe(false);
    expect(isDoNotDisturbHour(12, DEFAULT_DO_NOT_DISTURB)).toBe(false);
    expect(isDoNotDisturbHour(22, DEFAULT_DO_NOT_DISTURB)).toBe(false);
  });

  it('关闭开关后任何小时都不拦截', () => {
    const off = { ...DEFAULT_DO_NOT_DISTURB, enabled: false };
    expect(isDoNotDisturbHour(2, off)).toBe(false);
    expect(isDoNotDisturbHour(23, off)).toBe(false);
  });

  it('非跨零点窗口按半开区间判定；起止相同视为空窗口', () => {
    expect(isDoNotDisturbHour(13, { enabled: true, startHour: 13, endHour: 13 })).toBe(false);
    const noonBreak = { enabled: true, startHour: 12, endHour: 14 };
    expect(isDoNotDisturbHour(12, noonBreak)).toBe(true);
    expect(isDoNotDisturbHour(13, noonBreak)).toBe(true);
    expect(isDoNotDisturbHour(14, noonBreak)).toBe(false);
  });

  it('resolveInteraction：勿扰时段拦 touch，非勿扰时段放行', () => {
    const dndCtx = baseContext({ hour: 2 });
    expect(resolveInteraction({ kind: 'touch', region: 'head', gesture: 'tap' }, dndCtx)).toBeNull();
    const dayCtx = baseContext({ hour: 12 });
    expect(resolveInteraction({ kind: 'touch', region: 'head', gesture: 'tap' }, dayCtx)).not.toBeNull();
  });

  it('resolveInteraction：关闭勿扰后凌晨也能交互', () => {
    const ctx = baseContext({
      hour: 2,
      doNotDisturb: { ...DEFAULT_DO_NOT_DISTURB, enabled: false },
    });
    expect(resolveInteraction({ kind: 'touch', region: 'head', gesture: 'tap' }, ctx)).not.toBeNull();
  });
});
