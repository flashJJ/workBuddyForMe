import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  CHAT_PERF_METRICS,
  FIRST_TOKEN_ABSOLUTE_LIMIT_MS,
  createChatPerfReport,
  firstTokenThreshold,
  percentile,
  pruneReportNames,
  recordChatPerfReport,
  reportFileName,
  summarizeSamples,
} from './chat-perf-report.mjs';

const sample = (firstTokenMs, completionMs = firstTokenMs * 4) => ({
  coldStartMs: 900,
  firstTokenMs,
  firstParagraphMs: firstTokenMs + 120,
  completionMs,
});

test('百分位：奇数、偶数、空值与非法值', () => {
  assert.equal(percentile([3000], 95), 3000);
  assert.equal(percentile([2000, 4000], 50), 3000);
  assert.equal(percentile([1000, 2000, 3000, 4000], 50), 2500);
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([-1, Number.NaN, 'x'], 50), null);
});

test('首字阈值：1.5 倍与 10s 封顶', () => {
  assert.equal(firstTokenThreshold(2000), 3000);
  assert.equal(firstTokenThreshold(9000), FIRST_TOKEN_ABSOLUTE_LIMIT_MS);
  assert.equal(firstTokenThreshold(null), FIRST_TOKEN_ABSOLUTE_LIMIT_MS);
});

test('场景汇总固定四项指标，缺失值为 null', () => {
  const metrics = summarizeSamples([
    sample(1000),
    sample(3000),
    { firstTokenMs: 5000 },
  ]);
  assert.deepEqual(Object.keys(metrics), CHAT_PERF_METRICS);
  assert.equal(metrics.firstTokenMs.p50, 3000);
  assert.equal(metrics.firstTokenMs.p95, 4800);
  assert.equal(metrics.coldStartMs.p50, 900);
  assert.equal(metrics.completionMs.p50, 8000);
});

test('报告结构稳定，预算取全场景 firstToken P50', () => {
  const report = createChatPerfReport({
    at: '2026-11-22T10:00:00.000Z',
    env: { platform: 'win32', arch: 'x64', cpuCount: 16, node: '22.13.0' },
    scenarios: [
      { name: 'first-token', samples: [sample(2000), sample(4000)] },
      { name: 'chat-500', samples: [sample(3000)] },
    ],
  });
  assert.equal(report.suite, 'chat-perf');
  assert.equal(report.version, 1);
  assert.equal(report.at, '2026-11-22T10:00:00.000Z');
  assert.deepEqual(report.env, {
    platform: 'win32',
    arch: 'x64',
    cpuCount: 16,
    node: '22.13.0',
  });
  assert.equal(report.scenarios.length, 2);
  assert.equal(report.scenarios[0].samples, 2);
  assert.deepEqual(report.scenarios[0].metrics, summarizeSamples([sample(2000), sample(4000)]));
  assert.equal(report.budget.firstToken.p50, 3000);
  assert.equal(report.budget.firstToken.threshold, 4500);
  assert.equal(report.budget.firstToken.absoluteLimit, FIRST_TOKEN_ABSOLUTE_LIMIT_MS);
  assert.equal(report.budget.scrollP95FrameMs, 20);
});

test('文件名去分隔符，清理只删除最旧报告且忽略 latest.json', () => {
  assert.equal(reportFileName('2026-11-22T10:00:00.000Z'), 'report-20261122T100000000Z.json');
  const names = [
    reportFileName('2026-11-22T10:00:00.000Z'),
    reportFileName('2026-11-20T10:00:00.000Z'),
    'latest.json',
    'notes.txt',
  ];
  assert.deepEqual(pruneReportNames(names, 1), [reportFileName('2026-11-20T10:00:00.000Z')]);
  assert.deepEqual(pruneReportNames(names, 20), []);
});

test('写入历史与 latest，超限自动清理', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wbfm-chat-perf-'));
  try {
    const reports = [
      createChatPerfReport({
        at: '2026-11-20T00:00:00.000Z',
        scenarios: [{ name: 'first-token', samples: [sample(1000)] }],
      }),
      createChatPerfReport({
        at: '2026-11-21T00:00:00.000Z',
        scenarios: [{ name: 'first-token', samples: [sample(2000)] }],
      }),
      createChatPerfReport({
        at: '2026-11-22T00:00:00.000Z',
        scenarios: [{ name: 'first-token', samples: [sample(3000)] }],
      }),
    ];
    let latest;
    for (const report of reports) {
      latest = await recordChatPerfReport({ dir, report, keep: 2 });
    }
    assert.deepEqual(latest.pruned, ['report-20261120T000000000Z.json']);
    const files = (await readdir(dir)).sort();
    assert.deepEqual(files, [
      'latest.json',
      'report-20261121T000000000Z.json',
      'report-20261122T000000000Z.json',
    ]);
    const latestBody = JSON.parse(await readFile(join(dir, 'latest.json'), 'utf-8'));
    assert.equal(latestBody.at, '2026-11-22T00:00:00.000Z');
    assert.ok(files.includes(latest.name));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('隐私检查覆盖性能报告：命中绝对路径时拒绝写入', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wbfm-chat-perf-'));
  try {
    const report = createChatPerfReport({
      at: '2026-11-22T00:00:00.000Z',
      scenarios: [{ name: 'C:\\Users\\someone\\chat', samples: [sample(1000)] }],
    });
    await assert.rejects(() => recordChatPerfReport({ dir, report }), /隐私检查/);
    assert.deepEqual(await readdir(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
