import { describe, expect, it } from 'vitest';
import { extractRealtimeConstraints } from './memory-constraint';

describe('v2.26 实时硬约束规则', () => {
  it('过敏：命中并生成置顶 constraint + 主体键', () => {
    const [item] = extractRealtimeConstraints('我对花生过敏，请一定注意');
    expect(item).toMatchObject({
      kind: 'constraint',
      pinned: true,
      subjectKey: 'allergy:花生',
      importance: 0.95,
    });
    expect(item!.content).toBe('用户对花生过敏');
  });

  it('忌口与带时间前缀的禁止事项', () => {
    const items = extractRealtimeConstraints('我不能吃海鲜。以后不要熬夜。');
    const keys = items.map((item) => item.subjectKey);
    expect(keys).toContain('diet:avoid:海鲜');
    expect(keys.some((key) => key?.startsWith('prohibition:'))).toBe(true);
    expect(items.every((item) => item.pinned)).toBe(true);
  });

  it('显式记住写入 explicit 约束', () => {
    const items = extractRealtimeConstraints('记住：我的生日是 3 月 5 日');
    expect(items).toHaveLength(1);
    expect(items[0]!.content).toBe('用户要求记住：我的生日是 3 月 5 日');
    expect(items[0]!.subjectKey).toMatch(/^explicit:[0-9a-f]{8}$/);
  });

  it('窄规则：普通表述不误判，重复主体去重', () => {
    expect(extractRealtimeConstraints('别担心，今天天气不错')).toEqual([]);
    expect(extractRealtimeConstraints('今天不吃饭')).toEqual([]);
    expect(extractRealtimeConstraints('我最近有点过敏')).toEqual([]);
    expect(extractRealtimeConstraints('我妈妈对花生过敏')).toEqual([]);
    expect(extractRealtimeConstraints('我对花生过敏')).toHaveLength(1);
    expect(extractRealtimeConstraints('我对花生过敏，我对花生过敏')).toHaveLength(1);
  });
});
