import { describe, expect, it } from 'vitest';
import type { ActionChain } from './interaction-actions';
import {
  DEFAULT_INTERACTION_GRAPH,
  isHourInWindow,
  resolveInteractionEntry,
  type InteractionGraphContext,
  type InteractionGraphEntry,
} from './interaction-graph';

function chainWith(cooldownMs: number): ActionChain {
  return { actions: [], priority: 'normal', cooldownMs };
}

/** 造条目：默认键为 head::tap，可用 over 覆写条件/动作链 */
function entry(over: Partial<InteractionGraphEntry> = {}): InteractionGraphEntry {
  return { key: 'touch::head::tap', chain: () => chainWith(0), ...over };
}

function ctx(over: Partial<InteractionGraphContext> = {}): InteractionGraphContext {
  return { relationshipLevel: 'partner', mood: 'normal', hour: 12, ...over };
}

describe('isHourInWindow（时段窗口纯函数）', () => {
  it('非跨零点窗口按「含起、不含止」半开区间', () => {
    expect(isHourInWindow(12, 12, 14)).toBe(true);
    expect(isHourInWindow(13, 12, 14)).toBe(true);
    expect(isHourInWindow(14, 12, 14)).toBe(false);
    expect(isHourInWindow(11, 12, 14)).toBe(false);
  });

  it('跨零点窗口（23 → 6）', () => {
    expect(isHourInWindow(23, 23, 6)).toBe(true);
    expect(isHourInWindow(0, 23, 6)).toBe(true);
    expect(isHourInWindow(5, 23, 6)).toBe(true);
    expect(isHourInWindow(6, 23, 6)).toBe(false);
  });

  it('起止相同 = 空窗口（恒 false）', () => {
    expect(isHourInWindow(13, 13, 13)).toBe(false);
  });
});

describe('resolveInteractionEntry（动画图条件匹配）', () => {
  it('查不到键返回 null（保持「查不到返回空」语义）', () => {
    expect(resolveInteractionEntry(DEFAULT_INTERACTION_GRAPH, 'touch::unknown::tap', ctx())).toBeNull();
  });

  it('内置默认图与 v2.2 硬编码表等价：无门槛键恒命中', () => {
    for (const key of ['touch::head::tap', 'touch::body::tap', 'touch::body::double']) {
      expect(resolveInteractionEntry(DEFAULT_INTERACTION_GRAPH, key, ctx({ relationshipLevel: 'stranger', mood: 'low' }))).not.toBeNull();
    }
  });

  it('关系门槛：陌生人取不到 head::longpress，搭档可以', () => {
    expect(
      resolveInteractionEntry(DEFAULT_INTERACTION_GRAPH, 'touch::head::longpress', ctx({ relationshipLevel: 'stranger' })),
    ).toBeNull();
    expect(
      resolveInteractionEntry(DEFAULT_INTERACTION_GRAPH, 'touch::head::longpress', ctx({ relationshipLevel: 'partner' }))?.key,
    ).toBe('touch::head::longpress');
  });

  it('情绪档位：精确档位优先于兼容回退', () => {
    const entries = [
      entry({ condition: { mood: 'good' }, chain: () => chainWith(1) }),
      entry({ condition: { mood: 'normal' }, chain: () => chainWith(2) }),
    ];
    expect(resolveInteractionEntry(entries, 'touch::head::tap', ctx({ mood: 'good' }))?.chain().cooldownMs).toBe(1);
    // 无 good 条目时按兼容顺序回退到 normal
    expect(resolveInteractionEntry([entries[1]!], 'touch::head::tap', ctx({ mood: 'good' }))?.chain().cooldownMs).toBe(2);
  });

  it('无档位条件的条目兜底（档位条目被关系门槛挡住时仍可命中）', () => {
    const entries = [
      entry({ condition: { mood: 'good', minLevel: 'partner' }, chain: () => chainWith(1) }),
      entry({ chain: () => chainWith(9) }),
    ];
    // 精确档位命中但过不了门槛 → 回落到无档位条件的兜底条目
    expect(
      resolveInteractionEntry(entries, 'touch::head::tap', ctx({ mood: 'good', relationshipLevel: 'stranger' }))?.chain().cooldownMs,
    ).toBe(9);
    // 过了门槛则精确档位条目优先
    expect(
      resolveInteractionEntry(entries, 'touch::head::tap', ctx({ mood: 'good', relationshipLevel: 'partner' }))?.chain().cooldownMs,
    ).toBe(1);
  });

  it('时段条件：跨零点窗口外不命中', () => {
    const entries = [entry({ condition: { hours: { startHour: 22, endHour: 6 } } })];
    expect(resolveInteractionEntry(entries, 'touch::head::tap', ctx({ hour: 23 }))).not.toBeNull();
    expect(resolveInteractionEntry(entries, 'touch::head::tap', ctx({ hour: 12 }))).toBeNull();
  });

  it('门槛与档位同声明：门槛不够则整条不可用', () => {
    const entries = [entry({ condition: { mood: 'good', minLevel: 'partner' } })];
    expect(resolveInteractionEntry(entries, 'touch::head::tap', ctx({ mood: 'good', relationshipLevel: 'stranger' }))).toBeNull();
    expect(resolveInteractionEntry(entries, 'touch::head::tap', ctx({ mood: 'good', relationshipLevel: 'partner' }))).not.toBeNull();
  });
});
