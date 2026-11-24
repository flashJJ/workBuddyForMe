#!/usr/bin/env node
/**
 * 质量工程专项 F：`pnpm selftest` 最小版。
 *
 * 只跑定向 vitest（不构建、不打包），用真实文件库验证三个跨层场景：
 * 补偿重启恢复、能力包验签、运行保留 dry-run。
 * 每个场景按 `[场景名]` 前缀汇总为 PASS/FAIL，失败时给出定位提示。
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = 'src/flow/reliability/__tests__/selftest-scenarios.test.ts';
const REPORT_DIR = mkdtempSync(join(tmpdir(), 'wbfm-selftest-report-'));
const REPORT = join(REPORT_DIR, 'result.json');

const HINTS = {
  补偿重启恢复: '检查 compensation-service 的 recover()/sweep() 与重放触发方式',
  能力包验签: '检查 capabilities/signature.ts 的 payload 与信任公钥匹配',
  '保留 dry-run': '检查 retention-service cleanup() 的 dryRun 分支与 finished_at 语义',
};

function readAssertions() {
  try {
    const report = JSON.parse(readFileSync(REPORT, 'utf8'));
    return (report.testResults ?? []).flatMap((file) => file.assertionResults ?? []);
  } catch {
    return [];
  }
}

let exitCode = 1;
try {
  const run = spawnSync(
    'pnpm',
    ['--filter', '@wbfm/core', 'exec', 'vitest', 'run', TARGET, '--reporter=json', `--outputFile=${REPORT}`],
    { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' },
  );

  const assertions = readAssertions();
  const scenarios = assertions
    .map((item) => ({ ...item, name: item.title?.match(/^\[([^\]]+)\]/)?.[1] }))
    .filter((item) => item.name);

  if (scenarios.length === 0) {
    console.error('自测失败：无法解析 vitest 结果，请直接运行：');
    console.error(`  pnpm --filter @wbfm/core exec vitest run ${TARGET}`);
    process.exit(1);
  }

  console.log(`\n质量工程自测（${scenarios.length} 个核心场景）`);
  let passed = 0;
  for (const item of scenarios) {
    const ok = item.status === 'passed';
    if (ok) passed += 1;
    const ms = Math.round(item.duration ?? 0);
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  [${item.name}] ${ms}ms`);
    if (!ok) {
      const detail = (item.failureMessages ?? []).join('\n').split('\n').slice(0, 3).join('\n');
      if (detail) console.log(`        ${detail.replace(/\n/g, '\n        ')}`);
      const hint = HINTS[item.name];
      if (hint) console.log(`        定位提示：${hint}`);
    }
  }
  console.log(`\n结论：${passed}/${scenarios.length} 通过`);

  exitCode = run.status === 0 && passed === scenarios.length ? 0 : 1;
} finally {
  rmSync(REPORT_DIR, { recursive: true, force: true });
}

process.exit(exitCode);
