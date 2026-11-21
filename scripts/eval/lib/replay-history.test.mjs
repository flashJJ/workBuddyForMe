import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { REPLAY_METRICS, createReplayReport } from './replay-contract.mjs';
import {
  compareReplayMetrics,
  pruneHistoryNames,
  readLatestReplayReport,
  recordReplayHistory,
  replayHistoryFileName,
} from './replay-history.mjs';
import { renderReplayMarkdown } from './replay-report.mjs';

const CLEAN = {
  budgetUsage: 0.4,
  truncationRate: 0,
  memoryRetention: 1,
  citationRetention: 1,
  constraintRetention: 1,
};

function reportAt(at, candidate = CLEAN) {
  return {
    ...createReplayReport({
      golden: 'context-golden.json',
      baselineName: 'default-8k',
      candidateName: 'roomy-128k',
      baseline: CLEAN,
      candidate,
      cases: [{ strategy: 'roomy-128k', id: 'probe', budgetUsage: 0.4, truncated: false }],
    }),
    at,
  };
}

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'wbfm-replay-history-'));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('历史文件名去掉 ISO 分隔符，可按文件名排序', () => {
  assert.equal(
    replayHistoryFileName('2026-11-22T04:39:43.123Z'),
    'report-20261122T043943123Z.json',
  );
  const names = [
    replayHistoryFileName('2026-11-22T04:39:43.123Z'),
    replayHistoryFileName('2026-11-20T10:00:00.000Z'),
  ];
  assert.deepEqual([...names].sort(), [names[1], names[0]]);
});

test('历史清理按时间删除最旧，保留最近 N 份且忽略非报告文件', () => {
  const names = Array.from({ length: 23 }, (_, index) =>
    replayHistoryFileName(`2026-11-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
  );
  const pruned = pruneHistoryNames([...names, 'notes.txt'], 20);
  assert.deepEqual(pruned, names.slice(0, 3));
  assert.deepEqual(pruneHistoryNames(names.slice(0, 20), 20), []);
  assert.deepEqual(pruneHistoryNames(names.slice(0, 3), 0), names.slice(0, 2));
});

test('对比差值 = 本次候选 − 上次候选，缺失指标为 null', () => {
  const previous = reportAt('2026-11-21T00:00:00.000Z', { ...CLEAN, budgetUsage: 0.45 });
  const current = reportAt('2026-11-22T00:00:00.000Z', {
    ...CLEAN,
    budgetUsage: 0.4,
    memoryRetention: 0.95,
  });
  const comparison = compareReplayMetrics(previous, current);
  assert.equal(comparison.at, previous.at);
  assert.deepEqual(
    comparison.rows.map((row) => row.metric),
    REPLAY_METRICS,
  );
  const byMetric = Object.fromEntries(comparison.rows.map((row) => [row.metric, row]));
  assert.equal(byMetric.budgetUsage.delta, -0.05);
  assert.equal(byMetric.memoryRetention.delta, -0.05);
  assert.equal(byMetric.citationRetention.delta, 0);

  const missing = compareReplayMetrics(previous, { metrics: { candidate: {} } });
  assert.equal(missing.rows.every((row) => row.delta === null), true);
});

test('Markdown 新增「与上次对比」小节并打印差值', () => {
  const previous = reportAt('2026-11-21T00:00:00.000Z', { ...CLEAN, memoryRetention: 0.9 });
  const current = reportAt('2026-11-22T00:00:00.000Z');
  const comparison = compareReplayMetrics(previous, current);
  const markdown = renderReplayMarkdown(current, { pass: true, failures: [] }, comparison);
  assert.ok(markdown.includes('## 与上次对比'));
  assert.ok(markdown.includes('2026-11-21T00:00:00.000Z'));
  assert.ok(markdown.includes('| 记忆保留 (`memoryRetention`) | 0.9 | 1 | +0.1 | 越高越好 |'));
  assert.ok(markdown.includes('不参与阈值判定'));

  const without = renderReplayMarkdown(current, { pass: true, failures: [] });
  assert.equal(without.includes('## 与上次对比'), false);
});

test('历史归档写入原文并自动清理超限文件', async () => {
  await withTempDir(async (dir) => {
    const stamps = [
      '2026-11-20T00:00:00.000Z',
      '2026-11-21T00:00:00.000Z',
      '2026-11-22T00:00:00.000Z',
    ];
    const names = [];
    for (const stamp of stamps) {
      const result = await recordReplayHistory({ dir, report: reportAt(stamp), keep: 2 });
      names.push(result.name);
      if (stamp === stamps[2]) assert.deepEqual(result.pruned, [names[0]]);
    }
    assert.deepEqual((await readdir(dir)).sort(), names.slice(1).sort());
    const latest = JSON.parse(await readFile(join(dir, names[2]), 'utf-8'));
    assert.equal(latest.at, stamps[2]);
    assert.deepEqual(Object.keys(latest.metrics.candidate).sort(), [...REPLAY_METRICS].sort());
  });
});

test('隐私检查覆盖历史：命中绝对路径时拒绝写入', async () => {
  await withTempDir(async (dir) => {
    const leaky = reportAt('2026-11-22T00:00:00.000Z');
    leaky.cases.push({ strategy: 'roomy-128k', path: 'C:\\Users\\someone\\data' });
    await assert.rejects(() => recordReplayHistory({ dir, report: leaky }), /隐私检查/);
    assert.deepEqual(await readdir(dir), []);
  });
});

test('读取最新历史时排除本次文件名，目录缺失返回 null', async () => {
  await withTempDir(async (dir) => {
    const older = reportAt('2026-11-20T00:00:00.000Z');
    const newer = reportAt('2026-11-21T00:00:00.000Z');
    const current = reportAt('2026-11-22T00:00:00.000Z');
    await writeFile(
      join(dir, replayHistoryFileName(older.at)),
      `${JSON.stringify(older)}\n`,
      'utf-8',
    );
    await writeFile(
      join(dir, replayHistoryFileName(newer.at)),
      `${JSON.stringify(newer)}\n`,
      'utf-8',
    );
    const latest = await readLatestReplayReport(dir, replayHistoryFileName(current.at));
    assert.equal(latest.at, newer.at);

    const excluded = await readLatestReplayReport(dir, replayHistoryFileName(newer.at));
    assert.equal(excluded.at, older.at);

    assert.equal(await readLatestReplayReport(join(dir, 'missing'), ''), null);
  });
});
