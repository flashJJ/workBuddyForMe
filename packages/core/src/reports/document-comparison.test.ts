import { describe, expect, it } from 'vitest';
import type { DocumentTable } from '../ingestion/structure';
import { buildDocumentComparison, type ComparisonDocumentInput } from './document-comparison';

function table(tableNo: number, header: string[], rows: string[][], caption?: string): DocumentTable {
  return { tableNo, header, rows, ...(caption ? { caption } : {}) };
}

function doc(
  name: string,
  sections: string[][],
  tables: DocumentTable[],
  extra: Partial<ComparisonDocumentInput> = {},
): ComparisonDocumentInput {
  return {
    documentId: name,
    name,
    structureAvailable: true,
    sections: sections.map((path) => ({ path })),
    tables,
    warnings: [],
    ...extra,
  };
}

const LEFT = doc(
  '采购合同.md',
  [['合同'], ['合同', '付款条款'], ['合同', '交付']],
  [
    table(1, ['阶段', '比例'], [['首付', '30%'], ['尾款', '70%']]),
    table(2, ['条款', '说明'], [['违约金', '每日 0.5%']], '违约条款'),
  ],
);

const RIGHT = doc(
  '销售合同.md',
  [['合同'], ['合同', '付款条款'], ['合同', '保密']],
  [
    table(1, ['阶段', '比例'], [['首付', '30%'], ['尾款', '60%'], ['保证金', '10%']]),
    table(2, ['保密条款', '期限'], [['保密期', '三年']], '保密条款'),
  ],
);

describe('buildDocumentComparison（v2.19 跨文档对比）', () => {
  it('章节并集统计：共有/仅左/仅右', () => {
    const output = buildDocumentComparison(LEFT, RIGHT, {
      format: 'md',
      locale: 'zh',
      generatedAt: '2026-11-02T00:00:00.000Z',
    });
    expect(output.summary.sections).toEqual({ total: 4, shared: 2, leftOnly: 1, rightOnly: 1 });
    expect(output.summary.tables).toEqual({ left: 2, right: 2, matched: 1 });
  });

  it('表格按表头匹配并汇总行标签差异', () => {
    const closer = doc(
      '销售合同.md',
      [['合同']],
      [
        table(1, ['阶段', '比例'], [['首付', '30%'], ['尾款', '60%'], ['保证金', '10%']]),
        table(2, ['条款', '说明'], [['保密期', '三年']], '保密条款'),
      ],
    );
    const output = buildDocumentComparison(LEFT, closer, {
      format: 'md',
      locale: 'zh',
      generatedAt: '2026-11-02T00:00:00.000Z',
    });
    expect(output.summary.tables.matched).toBe(2);
    expect(output.content).toContain('| 左侧表 | 右侧表 | 表头 | 行数（左/右） | 行标签差异 |');
    expect(output.content).toContain('仅右侧的行：保证金');
  });

  it('Markdown 报告含章节状态、表格详情与未匹配表格', () => {
    const output = buildDocumentComparison(LEFT, RIGHT, {
      format: 'md',
      locale: 'zh',
      generatedAt: '2026-11-02T00:00:00.000Z',
    });
    expect(output.content).toContain('# 文档对比：采购合同.md vs 销售合同.md');
    expect(output.content).toContain('| 合同 › 交付 | ✓ | — | 仅左 |');
    expect(output.content).toContain('| 合同 › 保密 | — | ✓ | 仅右 |');
    expect(output.content).toContain('仅左侧的表：表 2：违约条款');
    expect(output.content).toContain('仅右侧的表：表 2：保密条款');
  });

  it('HTML 报告自包含且转义用户内容', () => {
    const unsafe = doc('<script>alert(1)</script>.md', [['A|B']], []);
    const output = buildDocumentComparison(unsafe, RIGHT, {
      format: 'html',
      locale: 'zh',
      generatedAt: '2026-11-02T00:00:00.000Z',
    });
    expect(output.mimeType).toBe('text/html');
    expect(output.content).toContain('<!DOCTYPE html>');
    expect(output.content).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(output.content).not.toContain('<script>alert(1)</script>');
    expect(output.content).toContain('A|B');
  });

  it('两侧结构缺失时明确说明未覆盖', () => {
    const legacyLeft = doc('旧文档.md', [], [], { structureAvailable: false });
    const legacyRight = doc('新文档.md', [], [], { structureAvailable: false });
    const output = buildDocumentComparison(legacyLeft, legacyRight, {
      format: 'md',
      locale: 'zh',
      generatedAt: '2026-11-02T00:00:00.000Z',
    });
    expect(output.summary.warnings).toContain('两侧文档均未解析结构，无法对比章节与表格');
    expect(output.content).toContain('## 解析警告');
    expect(output.content).toContain('（未识别到章节）');
    expect(output.content).toContain('（未识别到表格）');
  });

  it('英文报告使用英文标签；文件名与格式确定', () => {
    const output = buildDocumentComparison(LEFT, RIGHT, {
      format: 'html',
      locale: 'en',
      generatedAt: '2026-11-02T00:00:00.000Z',
    });
    expect(output.content).toContain('Document comparison');
    expect(output.content).toContain('Section comparison');
    expect(output.content).toContain('<html lang="en">');
    expect(output.filename).toBe('采购合同-vs-销售合同.html');
  });
});
