import { describe, expect, it } from 'vitest';
import { detectConflicts, type ConflictEntity, type ConflictMention } from './conflict-detector';

function m(documentId: string, context: string, extra?: Partial<ConflictMention>): ConflictMention {
  return {
    context,
    documentId,
    documentName: `${documentId}.txt`,
    pageNo: extra?.pageNo ?? null,
    paragraphNo: extra?.paragraphNo ?? null,
  };
}

function entity(over: Partial<ConflictEntity>): ConflictEntity {
  return {
    name: '某实体',
    normalizedName: 'moushiti',
    kind: 'concept',
    aliases: [],
    mentions: [],
    ...over,
  };
}

describe('detectConflicts（跨文档取值冲突，只建议不裁决）', () => {
  it('版本号跨文档不一致 → 检出 version 冲突，并列两出处与页码', () => {
    const conflicts = detectConflicts([
      entity({
        name: '天玑芯片',
        normalizedName: '天玑芯片',
        mentions: [
          m('d1', '天玑芯片的当前版本是 2.5，已量产。', { pageNo: 1 }),
          m('d2', '天玑芯片已升级到版本 3.0，支持新特性。', { pageNo: 4 }),
        ],
      }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.dimension).toBe('version');
    expect(conflicts[0]!.values.map((v) => v.value)).toEqual(['2.5', '3']);
    // raw 保留原始写法用于展示
    expect(conflicts[0]!.values.map((v) => v.raw)).toContain('3.0');
    expect(conflicts[0]!.values[0]!.occurrences[0]!.documentId).toBe('d1');
    expect(conflicts[0]!.values[1]!.occurrences[0]!.pageNo).toBe(4);
  });

  it('版本写法归一：v 前缀/尾零差异不构成冲突', () => {
    const conflicts = detectConflicts([
      entity({
        name: '天玑芯片',
        normalizedName: '天玑芯片',
        mentions: [m('d1', '天玑芯片版本 v2.5.0 稳定。'), m('d2', '天玑芯片 2.5 仍在售。')],
      }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it('同文档同时陈述两个版本（升级关系）→ 豁免，不报冲突', () => {
    const conflicts = detectConflicts([
      entity({
        name: '天玑芯片',
        normalizedName: '天玑芯片',
        mentions: [
          m('d1', '天玑芯片从 2.5 升级到 3.0，老版本停产。'),
          m('d2', '天玑芯片版本 3.0 已发布。'),
        ],
      }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it('同单位标量跨文档不一致 → scalar 冲突；数值一致不冲突', () => {
    const conflict = detectConflicts([
      entity({
        name: '显存规格',
        normalizedName: '显存规格',
        mentions: [m('d1', '显存规格为 32GB。'), m('d2', '显存规格达到 128GB。')],
      }),
    ]);
    expect(conflict).toHaveLength(1);
    expect(conflict[0]!.dimension).toBe('scalar');
    expect(conflict[0]!.values.map((v) => v.value)).toEqual(['32GB', '128GB']);

    const consistent = detectConflicts([
      entity({
        name: '显存规格',
        normalizedName: '显存规格',
        mentions: [m('d1', '显存规格为 32GB。'), m('d2', '显存规格 32GB 不变。')],
      }),
    ]);
    expect(consistent).toEqual([]);
  });

  it('同名不同义豁免：一个标量一个版本号（不同维度）不报冲突', () => {
    const conflicts = detectConflicts([
      entity({
        name: '苹果',
        normalizedName: '苹果',
        mentions: [
          m('d1', '苹果的延迟是 200ms。'),
          m('d2', '苹果发布版本 2.1 的新系统。'),
        ],
      }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it('人物头衔跨文档不一致 → title 冲突；非 person 实体不抽头衔', () => {
    const person = entity({
      name: '张伟',
      normalizedName: '张伟',
      kind: 'person',
      mentions: [m('d1', '张伟担任技术总监，负责研发。'), m('d2', '张伟出任产品经理。')],
    });
    const conflicts = detectConflicts([person]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.dimension).toBe('title');
    expect(conflicts[0]!.values.map((v) => v.value)).toEqual(['技术总监', '产品经理']);

    const notPerson = detectConflicts([{ ...person, kind: 'org' }]);
    expect(notPerson).toEqual([]);
  });

  it('mention 不含实体名/别名的句子不参与判定（远句无关数字不误报）', () => {
    const conflicts = detectConflicts([
      entity({
        name: '天玑芯片',
        normalizedName: '天玑芯片',
        aliases: ['Dimensity'],
        mentions: [
          m('d1', '天玑芯片功耗优秀。另一颗竞品是版本 9.9 的试验品。'),
          m('d2', 'Dimensity 产能稳定。竞品已演进到版本 8.8。'),
        ],
      }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it('一致实体、空 mentions、输出确定性排序', () => {
    expect(detectConflicts([entity({})])).toEqual([]);
    const a = entity({
      name: '乙实体', normalizedName: '乙',
      mentions: [m('d1', '乙实体版本 1.0。'), m('d2', '乙实体版本 2.0。')],
    });
    const b = entity({
      name: '甲实体', normalizedName: '甲',
      mentions: [m('d1', '甲实体版本 1.0。'), m('d2', '甲实体版本 2.0。')],
    });
    const conflicts = detectConflicts([a, b]);
    expect(conflicts.map((c) => c.normalizedName)).toEqual(['乙', '甲'].sort((x, y) => x.localeCompare(y, 'zh')));
    expect(detectConflicts([a, b])).toEqual(conflicts);
  });
});
