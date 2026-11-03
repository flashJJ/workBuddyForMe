import { describe, expect, it } from 'vitest';
import { DOCUMENT_FIXTURES } from './fixtures';

describe('v2.19 M1 文档结构 fixture（8 份）', () => {
  it('8 份 fixture 均可解析或明确降级，块坐标可回溯文本', async () => {
    for (const fixture of DOCUMENT_FIXTURES) {
      const parsed = await fixture.load();
      expect(parsed.blocks.length, fixture.id).toBeGreaterThanOrEqual(fixture.expects.minBlocks);
      expect(parsed.tables.length, fixture.id).toBeGreaterThanOrEqual(fixture.expects.minTables);
      expect(
        parsed.blocks.some((block) => block.kind === 'heading'),
        fixture.id,
      ).toBe(fixture.expects.hasHeading);
      expect(parsed.warnings.length > 0, fixture.id).toBe(fixture.expects.hasWarnings);

      for (const block of parsed.blocks) {
        expect(parsed.text.slice(block.charStart, block.charEnd)).toBe(block.content);
        expect(block.sectionPath.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it('合同 PDF：标题层级与表格落在「付款条款」章节，表头/行/表注可用', async () => {
    const contract = await DOCUMENT_FIXTURES.find((item) => item.id === 'contract-pdf')!.load();
    const headings = contract.blocks.filter((block) => block.kind === 'heading');
    expect(headings.map((block) => block.content)).toEqual(
      expect.arrayContaining(['采购合同', '付款条款']),
    );
    expect(headings[1]!.sectionPath).toEqual(['采购合同', '付款条款']);

    const table = contract.tables[0]!;
    expect(table.tableNo).toBe(1);
    expect(table.header).toEqual(['阶段', '比例', '金额']);
    expect(table.rows).toEqual([
      ['首付', '30%', '30 万'],
      ['尾款', '70%', '70 万'],
    ]);
    expect(table.caption).toContain('付款计划');
    expect(table.pageNo).toBe(1);
    const tableBlock = contract.blocks.find((block) => block.kind === 'table')!;
    expect(tableBlock.sectionPath).toEqual(['采购合同', '付款条款']);
    expect(tableBlock.content).toContain('| 阶段 | 比例 | 金额 |');
  });

  it('多栏 PDF：仍产出块，但给出结构可能不准确的告警', async () => {
    const multi = await DOCUMENT_FIXTURES.find((item) => item.id === 'multi-column-pdf')!.load();
    expect(multi.warnings.join('')).toContain('多栏');
  });

  it('Markdown/office 表格转 Markdown 块，列表不拆成段落', async () => {
    const md = await DOCUMENT_FIXTURES.find((item) => item.id === 'notes-md')!.load();
    const list = md.blocks.find((block) => block.kind === 'list')!;
    expect(list.content).toContain('首付款验收后支付');
    expect(md.tables[0]!.rows).toHaveLength(2);

    const xlsx = await DOCUMENT_FIXTURES.find((item) => item.id === 'finance-xlsx')!.load();
    expect(xlsx.tables[0]!.header).toEqual(['季度', '营收', '同比']);
    expect(xlsx.tables[0]!.rows[1]).toEqual(['2025 Q4', '1200 万', '20%']);

    const pptx = await DOCUMENT_FIXTURES.find((item) => item.id === 'slides-pptx')!.load();
    const pageOne = pptx.blocks.find((block) => block.pageNo === 1 && block.kind === 'heading');
    expect(pageOne?.content).toContain('第 1 页');
  });

  it('无结构纯文本：警告标题缺失，分块坐标仍连续可映射', async () => {
    const plain = await DOCUMENT_FIXTURES.find((item) => item.id === 'plain-txt')!.load();
    expect(plain.warnings.join('')).toContain('未检测到标题结构');
    expect(plain.blocks.every((block) => block.sectionPath.length === 0)).toBe(true);
    const last = plain.blocks[plain.blocks.length - 1]!;
    expect(last.charEnd).toBe(plain.text.length);
  });
});
