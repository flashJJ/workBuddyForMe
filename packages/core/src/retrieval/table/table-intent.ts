/**
 * v2.19 M3：表格意图识别（纯函数）。
 *
 * 表格问题（「付款比例是多少」「表 2 第 3 行」「对比两份合同」）与普通段落
 * 问题的召回偏好不同；这里只做轻量词面判断，供规则重排对 block_kind='table'
 * 的分片做小幅加权，不改变向量/FTS 召回与结构过滤。
 */

export interface TableIntent {
  isTableIntent: boolean;
  /** 命中的词面（可观测/调试用） */
  matches: string[];
}

/** 中文表格语境词：避免裸「表/行/列」误伤「表示」「行业」等常见词 */
const ZH_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: '表格', pattern: /表格/ },
  { label: '表号', pattern: /表\s*[0-9一二三四五六七八九十]+/ },
  { label: '第N行', pattern: /第\s*[0-9一二三四五六七八九十]+\s*行/ },
  { label: '哪一行', pattern: /(哪|第)[一二三四五六七八九十0-9]*\s*(行|列)/ },
  { label: '单元格', pattern: /单元格/ },
  { label: '对比', pattern: /对比|比较/ },
  { label: '合计', pattern: /合计|总计|汇总|小计|总额/ },
  {
    label: '指标',
    pattern: /金额|营收|收入|支出|成本|费用|付款|比例|占比|单价|数量|排名/,
  },
];

/** 英文表格语境词：按单词边界匹配，避免 "tab" 命中 "tablet" 以外的噪声 */
const EN_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'table', pattern: /\btable\b/i },
  { label: 'row', pattern: /\brow\b/i },
  { label: 'column', pattern: /\bcolumn\b/i },
  { label: 'cell', pattern: /\bcell\b/i },
  { label: 'compare', pattern: /\bcompare\b/i },
  { label: 'total', pattern: /\btotal\b/i },
  { label: 'sum', pattern: /\bsum\b/i },
  { label: 'revenue', pattern: /\brevenue\b/i },
  { label: 'amount', pattern: /\bamount\b/i },
  { label: 'payment', pattern: /\bpayment\b/i },
  { label: 'percentage', pattern: /\bpercentage\b/i },
];

/** 是否为表格意图查询；空串返回 false（不影响既有排序） */
export function detectTableIntent(query: string): TableIntent {
  const trimmed = query.trim();
  if (!trimmed) return { isTableIntent: false, matches: [] };
  const matches: string[] = [];
  for (const { label, pattern } of [...ZH_PATTERNS, ...EN_PATTERNS]) {
    if (pattern.test(trimmed)) matches.push(label);
  }
  return { isTableIntent: matches.length > 0, matches };
}
