/**
 * v4.18 M5：A/B 回放指标聚合与报告渲染（纯函数，供 eval-replay 与单测共用）。
 * 阈值与判定在 replay-contract.mjs，本文件只负责把采样变成五项指标与 Markdown。
 */
import {
  REPLAY_HIGHER_IS_BETTER,
  REPLAY_METRICS,
  REPLAY_THRESHOLDS,
} from './replay-contract.mjs';

const METRIC_LABELS = {
  budgetUsage: '预算占用',
  truncationRate: '截断率',
  memoryRetention: '记忆保留',
  citationRetention: '引用保留',
  constraintRetention: '约束保留',
};

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function ratio(hits, total) {
  if (!Array.isArray(hits) || total <= 0) return 0;
  return hits.filter((item) => item === 1).length / total;
}

/**
 * 汇总单个策略的采样。
 * @param {{
 *   turns: Array<{budgetUsage:number, truncated:boolean}>,
 *   retention: Record<string, number[]>,
 * }} input
 * @returns {Record<string, number>} 固定五项指标（0–1，保留三位）
 */
export function computeReplayMetrics({ turns = [], retention = {} } = {}) {
  const budget = turns.length === 0
    ? 0
    : turns.reduce((sum, turn) => sum + (Number(turn.budgetUsage) || 0), 0) / turns.length;
  const truncated = turns.filter((turn) => turn.truncated).length / Math.max(1, turns.length);
  const memory = retention.memory ?? [];
  const citation = retention.citation ?? [];
  const constraint = retention.constraint ?? [];
  return {
    budgetUsage: round(budget),
    truncationRate: round(truncated),
    memoryRetention: round(ratio(memory, memory.length)),
    citationRetention: round(ratio(citation, citation.length)),
    constraintRetention: round(ratio(constraint, constraint.length)),
  };
}

/** 去掉时间戳后的稳定序列化：同一输入两次运行必须完全一致 */
export function stableReportJson(report) {
  const { at: _ignored, ...rest } = report ?? {};
  return JSON.stringify(rest);
}

function formatNumber(value) {
  return typeof value === 'number' ? value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : '—';
}

function formatDelta(value) {
  if (typeof value !== 'number') return '—';
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

/** 「与上次对比」小节：只展示差值，不参与阈值判定 */
function renderComparisonSection(comparison) {
  if (!comparison?.rows?.length) return [];
  const lines = [
    '## 与上次对比',
    '',
    `- 上次报告：${comparison.at ?? '—'}`,
    '- 差值口径：本次候选 − 上次候选（不参与阈值判定）',
    '',
    '| 指标 | 上次 | 本次 | 变化 | 方向 |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const row of comparison.rows) {
    lines.push(
      `| ${METRIC_LABELS[row.metric] ?? row.metric} (\`${row.metric}\`) | ${formatNumber(
        row.previous,
      )} | ${formatNumber(row.current)} | ${formatDelta(row.delta)} | ${
        REPLAY_HIGHER_IS_BETTER[row.metric] ? '越高越好' : '越低越好'
      } |`,
    );
  }
  lines.push('');
  return lines;
}

/** 阈值说明：绝对下限 / 相对退化上限 */
function formatThreshold(metric, thresholds) {
  const floor = thresholds?.floors?.[metric];
  const regression = thresholds?.maxRegression?.[metric];
  const parts = [];
  if (typeof floor === 'number') parts.push(`≥ ${formatNumber(floor)}`);
  if (typeof regression === 'number') {
    parts.push(`${REPLAY_HIGHER_IS_BETTER[metric] ? '↓' : '↑'} ≤ ${formatNumber(regression)}`);
  }
  return parts.join('，') || '—';
}

/**
 * 生成 Markdown 报告：指标对比、阈值与失败项。
 * @param {ReturnType<import('./replay-contract.mjs').createReplayReport>} report
 * @param {{pass:boolean, failures:string[]}} verdict
 * @param {ReturnType<import('./replay-history.mjs').compareReplayMetrics> | null} [comparison]
 */
export function renderReplayMarkdown(report, verdict, comparison = null) {
  const thresholds = report?.thresholds ?? REPLAY_THRESHOLDS;
  const baseline = report?.metrics?.baseline ?? {};
  const candidate = report?.metrics?.candidate ?? {};
  const lines = [
    '# 离线 A/B 回放与上下文保真报告',
    '',
    `- 套件：${report?.suite ?? 'eval-replay'} v${report?.version ?? 1}`,
    `- 生成时间：${report?.at ?? '—'}`,
    `- golden：${report?.golden ?? '—'}`,
    `- 基线策略：${report?.strategies?.baseline ?? '—'}`,
    `- 候选策略：${report?.strategies?.candidate ?? '—'}`,
    `- 结论：${verdict?.pass ? 'PASS' : 'FAIL'}`,
    '',
    '| 指标 | 基线 | 候选 | 阈值 | 方向 |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const metric of REPLAY_METRICS) {
    lines.push(
      `| ${METRIC_LABELS[metric] ?? metric} (\`${metric}\`) | ${formatNumber(
        baseline[metric],
      )} | ${formatNumber(candidate[metric])} | ${formatThreshold(metric, thresholds)} | ${
        REPLAY_HIGHER_IS_BETTER[metric] ? '越高越好' : '越低越好'
      } |`,
    );
  }
  lines.push('');
  lines.push(...renderComparisonSection(comparison));
  if (verdict?.failures?.length) {
    lines.push('## 失败项', '');
    for (const failure of verdict.failures) lines.push(`- ${failure}`);
    lines.push('');
  }
  lines.push(
    '## 口径说明',
    '',
    '- 预算占用 = 每轮（system + 工具声明 + 输出预留 + 历史）÷ 可用窗口的均值；',
    '- 截断率 = 触发历史截断的轮次占比；保留率 = 探针分组中仍在上下文里的标记占比；',
    '- 以上均为代理指标，只用于同一 golden 下的相对比较，不代表真实用户满意度。',
    '',
  );
  return lines.join('\n');
}
