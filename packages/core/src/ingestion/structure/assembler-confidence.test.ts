import { describe, expect, it } from 'vitest';
import { assembleDocument, tableConfidence } from './assembler';

describe('tableConfidence（v2.19 M5 表格结构置信度）', () => {
  it('规则表格：表头与行一致、列数≥2 → 置信度 1', () => {
    const parsed = assembleDocument([
      {
        kind: 'table',
        content: '',
        pageNo: 1,
        table: {
          header: ['阶段', '比例'],
          rows: [
            ['首付', '30%'],
            ['尾款', '70%'],
          ],
          pageNo: 1,
        },
      },
    ]);
    expect(parsed.tables[0]!.confidence).toBe(1);
    expect(parsed.warnings.join('')).not.toContain('置信度较低');
  });

  it('缺表头/单列/稀疏：置信度下降并给出降级警告', () => {
    const parsed = assembleDocument([
      {
        kind: 'table',
        content: '',
        pageNo: 1,
        table: {
          header: ['项目'],
          rows: [['首付'], ['']],
          pageNo: 1,
        },
      },
    ]);
    expect(parsed.tables[0]!.confidence).toBeLessThan(0.6);
    expect(parsed.warnings.join('')).toContain('置信度较低');
  });

  it('错列行降低置信度；纯函数可直接复用', () => {
    const table = {
      header: ['A', 'B'],
      rows: [
        ['1', '2', '多余'],
        ['3', '4'],
      ],
    };
    expect(tableConfidence(table)).toBe(0.8);
    expect(
      tableConfidence({ header: [], rows: [['x']] }),
    ).toBeLessThan(0.5);
  });
});
