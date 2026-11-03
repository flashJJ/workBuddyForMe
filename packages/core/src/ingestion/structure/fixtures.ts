import { zipSync } from 'fflate';
import * as XLSX from 'xlsx';
import { readPptx } from '../office/read-pptx';
import { readXlsx } from '../office/read-xlsx';
import { buildPdfDocument } from './pdf-parser';
import { parseDocxDocument, parseOfficeText } from './office-parser';
import { parsePagedTextDocument, parseTextDocument } from './text-parser';
import type { ParsedDocument } from './types';

export interface DocumentFixture {
  id: string;
  /** 覆盖 8 份验收 fixture：多栏 PDF / 合同 / 财报表格 / 扫描页 / MD / DOCX / PPTX / 无结构文本 */
  description: string;
  load: () => Promise<ParsedDocument>;
  expects: {
    minBlocks: number;
    hasHeading: boolean;
    minTables: number;
    hasWarnings: boolean;
  };
}

interface PdfItemSpec {
  text: string;
  x: number;
  y: number;
  size?: number;
}

/** 构造 pdfjs TextItem 形状；width 按字号与字符数估算，供列间距判断 */
export function pdfItems(specs: readonly PdfItemSpec[]): unknown[] {
  return specs.map((spec) => {
    const size = spec.size ?? 11;
    return {
      str: spec.text,
      transform: [size, 0, 0, size, spec.x, spec.y],
      width: spec.text.length * size * 0.6,
    };
  });
}

function contractPdf(): ParsedDocument {
  const specs: PdfItemSpec[] = [
    { text: '采购合同', x: 50, y: 760, size: 20 },
    { text: '付款条款', x: 50, y: 715, size: 14 },
    { text: '本合同项下付款分为两个阶段，具体安排如下。', x: 50, y: 685 },
    { text: '双方应按约定节点完成验收与付款。', x: 50, y: 665 },
    { text: '表 1 付款计划', x: 50, y: 625 },
    { text: '阶段', x: 50, y: 600 },
    { text: '比例', x: 160, y: 600 },
    { text: '金额', x: 280, y: 600 },
    { text: '首付', x: 50, y: 580 },
    { text: '30%', x: 160, y: 580 },
    { text: '30 万', x: 280, y: 580 },
    { text: '尾款', x: 50, y: 560 },
    { text: '70%', x: 160, y: 560 },
    { text: '70 万', x: 280, y: 560 },
  ];
  return buildPdfDocument([{ pageNo: 1, items: pdfItems(specs) }]);
}

function multiColumnPdf(): ParsedDocument {
  const specs: PdfItemSpec[] = [{ text: '双栏排版示例', x: 50, y: 760, size: 18 }];
  for (let index = 0; index < 6; index += 1) {
    const y = 700 - index * 24;
    specs.push({ text: `左栏第 ${index + 1} 行`, x: 50, y });
    specs.push({ text: `右栏第 ${index + 1} 行`, x: 300, y });
  }
  return buildPdfDocument([{ pageNo: 1, items: pdfItems(specs) }]);
}

function scannedPages(): ParsedDocument {
  return parsePagedTextDocument(
    [
      { pageNo: 1, text: '扫描件第一页\n合同编号 A-2026-001\n甲方 示例公司' },
      { pageNo: 2, text: '扫描件第二页\n付款方式 银行转账\n金额 100 万元' },
    ],
    ['第 1 页文字层稀疏，已使用 OCR 文本重建结构'],
  );
}

function markdownDoc(): ParsedDocument {
  return parseTextDocument(`# 合同说明

## 付款条款

本项目付款分两阶段执行。

| 阶段 | 比例 | 金额 |
| --- | --- | --- |
| 首付 | 30% | 30 万 |
| 尾款 | 70% | 70 万 |

- 首付款验收后支付
- 尾款交付后支付

> 附注：以上金额为含税价。
`);
}

async function docxDoc(): Promise<ParsedDocument> {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>项目周报</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>本周进展</w:t></w:r></w:p>
  <w:p><w:r><w:t>完成需求评审并进入开发阶段。</w:t></w:r></w:p>
  <w:tbl>
    <w:tr><w:tc><w:p><w:r><w:t>事项</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>负责人</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>接口联调</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>张三</w:t></w:r></w:p></w:tc></w:tr>
  </w:tbl>
</w:body></w:document>`;
  return parseDocxDocument(zipSync({ 'word/document.xml': new TextEncoder().encode(documentXml) }));
}

async function pptxDoc(): Promise<ParsedDocument> {
  const entries: Record<string, Uint8Array> = {};
  for (const pageNo of [1, 2]) {
    entries[`ppt/slides/slide${pageNo}.xml`] = new TextEncoder().encode(
      `<p:a xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
        `<a:p><a:r><a:t>第 ${pageNo} 页标题</a:t></a:r></a:p>` +
        `<a:p><a:r><a:t>本页要点 ${pageNo}</a:t></a:r></a:p></p:a>`,
    );
  }
  return parseOfficeText(readPptx(zipSync(entries)));
}

async function xlsxDoc(): Promise<ParsedDocument> {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['季度', '营收', '同比'],
      ['2025 Q3', '800 万', '15%'],
      ['2025 Q4', '1200 万', '20%'],
    ]),
    '财报',
  );
  const data = new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
  return parseOfficeText(readXlsx(data));
}

function plainTextDoc(): ParsedDocument {
  return parseTextDocument(`本文件没有标题层级，只有连续段落。

第二段继续描述事项，不包含章节、列表或表格。
`);
}

export const DOCUMENT_FIXTURES: DocumentFixture[] = [
  {
    id: 'contract-pdf',
    description: '合同 PDF：标题/章节/表 1 付款计划',
    load: async () => contractPdf(),
    expects: { minBlocks: 5, hasHeading: true, minTables: 1, hasWarnings: false },
  },
  {
    id: 'multi-column-pdf',
    description: '多栏 PDF：可解析但明确告警结构可能不准确',
    load: async () => multiColumnPdf(),
    expects: { minBlocks: 2, hasHeading: true, minTables: 0, hasWarnings: true },
  },
  {
    id: 'scanned-pdf',
    description: '扫描页 OCR：按页重建文本结构并保留降级告警',
    load: async () => scannedPages(),
    expects: { minBlocks: 2, hasHeading: false, minTables: 0, hasWarnings: true },
  },
  {
    id: 'notes-md',
    description: 'Markdown：章节/表格/列表',
    load: async () => markdownDoc(),
    expects: { minBlocks: 5, hasHeading: true, minTables: 1, hasWarnings: false },
  },
  {
    id: 'report-docx',
    description: 'DOCX：标题层级/段落/表格',
    load: docxDoc,
    expects: { minBlocks: 3, hasHeading: true, minTables: 1, hasWarnings: false },
  },
  {
    id: 'slides-pptx',
    description: 'PPTX：按页生成章节与段落',
    load: pptxDoc,
    expects: { minBlocks: 4, hasHeading: true, minTables: 0, hasWarnings: false },
  },
  {
    id: 'finance-xlsx',
    description: '财报表格 XLSX：工作表标题 + 表格',
    load: xlsxDoc,
    expects: { minBlocks: 2, hasHeading: true, minTables: 1, hasWarnings: false },
  },
  {
    id: 'plain-txt',
    description: '无结构纯文本：降级为段落并告警',
    load: async () => plainTextDoc(),
    expects: { minBlocks: 2, hasHeading: false, minTables: 0, hasWarnings: true },
  },
];
