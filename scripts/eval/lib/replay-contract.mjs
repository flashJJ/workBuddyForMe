/**
 * v4.18 E 线：离线 A/B 回放报告契约（唯一事实源）。
 *
 * 同一组 golden 用例分别跑基线策略与候选策略，只比较相对差异与绝对下限，
 * 不把代理指标当作真实用户满意度。报告只落本机 test-results/，不含绝对路径、正文与密钥。
 */

export const REPLAY_METRICS = [
  'budgetUsage',
  'truncationRate',
  'memoryRetention',
  'citationRetention',
  'constraintRetention',
];

/** true=越高越好；false=越低越好 */
export const REPLAY_HIGHER_IS_BETTER = {
  budgetUsage: false,
  truncationRate: false,
  memoryRetention: true,
  citationRetention: true,
  constraintRetention: true,
};

export const REPLAY_THRESHOLDS = {
  /** 绝对下限：低于即失败（比例 0–1） */
  floors: {
    memoryRetention: 0.9,
    citationRetention: 0.8,
    constraintRetention: 0.95,
  },
  /** 相对基线允许的最大退化；越低越好的指标解释为允许上升值 */
  maxRegression: {
    budgetUsage: 0.05,
    truncationRate: 0.05,
    memoryRetention: 0.05,
    citationRetention: 0.05,
    constraintRetention: 0.05,
  },
  /** 候选策略预算占用硬上限 */
  maxBudgetUsage: 0.95,
};

export const REPLAY_REPORT_DIR = 'test-results/eval-replay';
export const REPLAY_REPORT_JSON = 'report.json';
export const REPLAY_REPORT_MARKDOWN = 'report.md';

/**
 * 组装报告骨架；指标由 M5 的回放器计算后传入。
 * @param {{
 *   golden: string,
 *   baselineName: string,
 *   candidateName: string,
 *   baseline: Record<string, number>,
 *   candidate: Record<string, number>,
 *   cases?: Array<Record<string, unknown>>,
 * }} input
 */
export function createReplayReport(input) {
  return {
    suite: 'eval-replay',
    version: 1,
    at: new Date().toISOString(),
    golden: input.golden,
    strategies: { baseline: input.baselineName, candidate: input.candidateName },
    metrics: { baseline: input.baseline, candidate: input.candidate },
    cases: input.cases ?? [],
    thresholds: REPLAY_THRESHOLDS,
  };
}

/**
 * 判定候选策略是否可接受：绝对下限 + 相对退化 + 预算硬上限。
 * @param {ReturnType<typeof createReplayReport>} report
 * @param {typeof REPLAY_THRESHOLDS} [thresholds]
 * @returns {{pass:boolean, failures:string[]}}
 */
export function evaluateReplayReport(report, thresholds = REPLAY_THRESHOLDS) {
  const failures = [];
  const baseline = report?.metrics?.baseline ?? {};
  const candidate = report?.metrics?.candidate ?? {};

  for (const metric of REPLAY_METRICS) {
    const value = candidate[metric];
    if (typeof value !== 'number') {
      failures.push(`${metric}: 候选策略缺少指标`);
      continue;
    }
    const floor = thresholds.floors?.[metric];
    if (typeof floor === 'number' && value < floor) {
      failures.push(`${metric}: ${value} 低于绝对下限 ${floor}`);
    }
    const from = baseline[metric];
    if (typeof from === 'number') {
      const limit = thresholds.maxRegression?.[metric] ?? 0;
      const regression = REPLAY_HIGHER_IS_BETTER[metric] ? from - value : value - from;
      if (regression > limit) {
        failures.push(`${metric}: 相对基线退化 ${regression.toFixed(3)} 超过 ${limit}`);
      }
    }
  }

  if (
    typeof candidate.budgetUsage === 'number' &&
    candidate.budgetUsage > thresholds.maxBudgetUsage
  ) {
    failures.push(`${candidate.budgetUsage} 超过预算占用硬上限 ${thresholds.maxBudgetUsage}`);
  }

  return { pass: failures.length === 0, failures };
}

const SENSITIVE_PATTERNS = [
  { name: 'absolute_path', pattern: /(?:[A-Za-z]:\\\\|\/(?:home|Users|root)\/)/i },
  { name: 'bearer_token', pattern: /Bearer\s+[A-Za-z0-9._-]{8,}/ },
  { name: 'api_key', pattern: /\bsk-[A-Za-z0-9]{8,}/ },
];

/**
 * 隐私检查：报告序列化后不得出现绝对路径、Bearer 令牌或常见 API Key 前缀。
 * @param {unknown} report
 * @returns {string[]} 命中的风险类型（空数组表示通过）
 */
export function findSensitiveContent(report) {
  const text = JSON.stringify(report);
  return SENSITIVE_PATTERNS.filter((item) => item.pattern.test(text)).map((item) => item.name);
}
