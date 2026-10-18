import { describe, expect, it } from 'vitest';
import {
  ACTION_CHAINS,
  buildInteractionGraph,
  chainOf,
  DEFAULT_INTERACTION_GRAPH,
  isHourInWindow,
  isValidTriggerKey,
  resolveInteractionEntry,
  type InteractionGraphContext,
  type InteractionGraphEntry,
} from './interaction-graph';

/** 造条目：默认键为 head::tap / 条目 head-tap，可用 over 覆写条件与条目 id */
function entry(over: Partial<InteractionGraphEntry> = {}): InteractionGraphEntry {
  return { key: 'touch::head::tap', chainId: 'head-tap', ...over };
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

describe('isValidTriggerKey（配置校验用触发键集合）', () => {
  it('区域 × 手势全组合合法，其余（含花括号外的猜测键）非法', () => {
    expect(isValidTriggerKey('touch::head::tap')).toBe(true);
    expect(isValidTriggerKey('touch::body::double')).toBe(true);
    expect(isValidTriggerKey('touch::unknown::release')).toBe(true);
    expect(isValidTriggerKey('touch::head::swipe-up')).toBe(false);
    expect(isValidTriggerKey('touch::tail::tap')).toBe(false);
    expect(isValidTriggerKey('head::tap')).toBe(false);
  });
});

describe('条目目录 ACTION_CHAINS', () => {
  it('每个内置条目 id 都能产出动作链', () => {
    for (const id of Object.keys(ACTION_CHAINS) as Array<keyof typeof ACTION_CHAINS>) {
      const chain = ACTION_CHAINS[id]();
      expect(chain.actions.length).toBeGreaterThan(0);
      expect(chain.cooldownMs).toBeGreaterThan(0);
    }
  });

  it('chainOf 按条目引用取链（不存在时不做隐式兜底）', () => {
    expect(chainOf(entry({ chainId: 'body-double' })).cooldownMs).toBe(
      ACTION_CHAINS['body-double']().cooldownMs,
    );
  });
});

describe('resolveInteractionEntry（动画图条件匹配）', () => {
  it('查不到键返回 null（保持「查不到返回空」语义）', () => {
    expect(resolveInteractionEntry(DEFAULT_INTERACTION_GRAPH, 'touch::unknown::tap', ctx())).toBeNull();
  });

  it('内置默认图与 v2.2 硬编码表等价：无门槛键恒命中', () => {
    for (const key of ['touch::head::tap', 'touch::body::tap', 'touch::body::double']) {
      expect(
        resolveInteractionEntry(DEFAULT_INTERACTION_GRAPH, key, ctx({ relationshipLevel: 'stranger', mood: 'low' })),
      ).not.toBeNull();
    }
  });

  it('关系门槛：陌生人取不到 head::longpress，搭档可以', () => {
    expect(
      resolveInteractionEntry(DEFAULT_INTERACTION_GRAPH, 'touch::head::longpress', ctx({ relationshipLevel: 'stranger' })),
    ).toBeNull();
    expect(
      resolveInteractionEntry(DEFAULT_INTERACTION_GRAPH, 'touch::head::longpress', ctx({ relationshipLevel: 'partner' }))?.chainId,
    ).toBe('head-longpress');
  });

  it('情绪档位：精确档位优先于兼容回退', () => {
    const entries = [
      entry({ condition: { mood: 'good' }, chainId: 'head-longpress' }),
      entry({ condition: { mood: 'normal' }, chainId: 'body-tap' }),
    ];
    expect(resolveInteractionEntry(entries, 'touch::head::tap', ctx({ mood: 'good' }))?.chainId).toBe('head-longpress');
    // 无 good 条目时按兼容顺序回退到 normal
    expect(resolveInteractionEntry([entries[1]!], 'touch::head::tap', ctx({ mood: 'good' }))?.chainId).toBe('body-tap');
  });

  it('无档位条件的条目兜底（档位条目被关系门槛挡住时仍可命中）', () => {
    const entries = [
      entry({ condition: { mood: 'good', minLevel: 'partner' }, chainId: 'head-longpress' }),
      entry({ chainId: 'body-double' }),
    ];
    // 精确档位命中但过不了门槛 → 回落到无档位条件的兜底条目
    expect(
      resolveInteractionEntry(entries, 'touch::head::tap', ctx({ mood: 'good', relationshipLevel: 'stranger' }))?.chainId,
    ).toBe('body-double');
    // 过了门槛则精确档位条目优先
    expect(
      resolveInteractionEntry(entries, 'touch::head::tap', ctx({ mood: 'good', relationshipLevel: 'partner' }))?.chainId,
    ).toBe('head-longpress');
  });

  it('时段条件：跨零点窗口外不命中', () => {
    const entries = [entry({ condition: { hours: { startHour: 22, endHour: 6 } } })];
    expect(resolveInteractionEntry(entries, 'touch::head::tap', ctx({ hour: 23 }))).not.toBeNull();
    expect(resolveInteractionEntry(entries, 'touch::head::tap', ctx({ hour: 12 }))).toBeNull();
  });

  it('门槛与档位同声明：门槛不够则整条不可用', () => {
    const entries = [entry({ condition: { mood: 'good', minLevel: 'partner' } })];
    expect(
      resolveInteractionEntry(entries, 'touch::head::tap', ctx({ mood: 'good', relationshipLevel: 'stranger' })),
    ).toBeNull();
    expect(
      resolveInteractionEntry(entries, 'touch::head::tap', ctx({ mood: 'good', relationshipLevel: 'partner' })),
    ).not.toBeNull();
  });
});

describe('buildInteractionGraph（覆盖条目叠加）', () => {
  it('无覆盖时直接复用内置图', () => {
    expect(buildInteractionGraph()).toBe(DEFAULT_INTERACTION_GRAPH);
    expect(buildInteractionGraph([])).toBe(DEFAULT_INTERACTION_GRAPH);
  });

  it('有覆盖时覆盖条目排前，内置图仍兜底（不会「没有可播动作」）', () => {
    const override = entry({ condition: { minLevel: 'intimate' }, chainId: 'raised-tap' });
    const graph = buildInteractionGraph([override]);
    expect(graph[0]).toBe(override);
    // 门槛达标 → 覆盖条目优先
    expect(
      resolveInteractionEntry(graph, 'touch::head::tap', ctx({ relationshipLevel: 'intimate' }))?.chainId,
    ).toBe('raised-tap');
    // 门槛不达标 → 回落到内置条目
    expect(
      resolveInteractionEntry(graph, 'touch::head::tap', ctx({ relationshipLevel: 'partner' }))?.chainId,
    ).toBe('head-tap');
  });
});
