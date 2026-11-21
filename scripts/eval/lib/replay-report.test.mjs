import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createReplayReport,
  evaluateReplayReport,
  findSensitiveContent,
  REPLAY_METRICS,
} from './replay-contract.mjs';
import {
  computeReplayMetrics,
  renderReplayMarkdown,
  stableReportJson,
} from './replay-report.mjs';

const CLEAN = {
  budgetUsage: 0.4,
  truncationRate: 0,
  memoryRetention: 1,
  citationRetention: 1,
  constraintRetention: 1,
};

function reportWith(candidate = CLEAN, baseline = CLEAN) {
  return createReplayReport({
    golden: 'context-golden.json',
    baselineName: 'default-8k',
    candidateName: 'roomy-128k',
    baseline,
    candidate,
    cases: [{ strategy: 'default-8k', id: 'probe', budgetUsage: 0.4, truncated: false }],
  });
}

test('computeReplayMetrics：预算占用取均值、截断取占比、保留取命中率', () => {
  const metrics = computeReplayMetrics({
    turns: [
      { budgetUsage: 0.2, truncated: false },
      { budgetUsage: 0.6, truncated: true },
    ],
    retention: { memory: [1, 0], citation: [1, 1], constraint: [1, 1] },
  });
  assert.equal(metrics.budgetUsage, 0.4);
  assert.equal(metrics.truncationRate, 0.5);
  assert.equal(metrics.memoryRetention, 0.5);
  assert.equal(metrics.citationRetention, 1);
  assert.equal(metrics.constraintRetention, 1);
});

test('报告字段完整，同一输入两次运行除 at 外完全一致', () => {
  const first = reportWith();
  const second = reportWith();
  assert.deepEqual(Object.keys(first).sort(), [
    'at',
    'cases',
    'golden',
    'metrics',
    'strategies',
    'suite',
    'thresholds',
    'version',
  ]);
  assert.equal(first.suite, 'eval-replay');
  assert.equal(first.version, 1);
  assert.deepEqual(Object.keys(first.metrics.candidate).sort(), [...REPLAY_METRICS].sort());
  assert.equal(first.golden, 'context-golden.json');
  assert.equal(first.strategies.baseline, 'default-8k');
  assert.equal(stableReportJson(first), stableReportJson(second));
});

test('退化用例必失败：绝对下限、相对退化与预算硬上限', () => {
  assert.equal(evaluateReplayReport(reportWith()).pass, true);

  const floor = evaluateReplayReport(reportWith({ ...CLEAN, memoryRetention: 0.8 }));
  assert.equal(floor.pass, false);
  assert.ok(floor.failures.some((item) => item.includes('memoryRetention')));

  const regression = evaluateReplayReport(
    reportWith({ ...CLEAN, budgetUsage: 0.6 }, { ...CLEAN, budgetUsage: 0.4 }),
  );
  assert.equal(regression.pass, false);
  assert.ok(regression.failures.some((item) => item.includes('budgetUsage')));

  const hardCap = evaluateReplayReport(reportWith({ ...CLEAN, budgetUsage: 0.97 }));
  assert.equal(hardCap.pass, false);
  assert.ok(hardCap.failures.some((item) => item.includes('硬上限')));
});

test('隐私检查：命中绝对路径、Bearer 与 API Key，干净报告不误报', () => {
  assert.deepEqual(findSensitiveContent(reportWith()), []);
  const leaky = reportWith();
  leaky.cases.push({
    strategy: 'default-8k',
    path: 'C:\\Users\\someone\\data',
    header: 'Bearer abcdefgh12345678',
    key: 'sk-abcdefgh12345678',
  });
  const hits = findSensitiveContent(leaky);
  assert.ok(hits.includes('absolute_path'));
  assert.ok(hits.includes('bearer_token'));
  assert.ok(hits.includes('api_key'));
});

test('Markdown 报告包含五项指标、基线与候选、结论', () => {
  const report = reportWith();
  const verdict = evaluateReplayReport(report);
  const markdown = renderReplayMarkdown(report, verdict);
  for (const metric of REPLAY_METRICS) assert.ok(markdown.includes(metric));
  assert.ok(markdown.includes('default-8k'));
  assert.ok(markdown.includes('roomy-128k'));
  assert.ok(markdown.includes('PASS'));
  assert.ok(markdown.includes('代理指标'));
});
