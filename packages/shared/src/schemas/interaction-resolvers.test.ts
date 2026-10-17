import { describe, expect, it } from 'vitest';
import {
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
