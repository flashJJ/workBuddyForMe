#!/usr/bin/env node
/**
 * 把 Stryker JSON 报告汇总为 GitHub Job Summary（质量工程专项 E）。
 * 用法：node scripts/mutation-summary.mjs [report.json]
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] ?? join(ROOT, 'reports', 'mutation', 'reliability.json');

if (!existsSync(file)) {
  console.log('### 可靠性域变异测试\n\n未生成报告（构建或测试初始化失败，见上方日志）。');
  process.exit(0);
}

const report = JSON.parse(readFileSync(file, 'utf8'));
const rows = [];
const survivors = [];
let total = 0;
let detected = 0;
let valid = 0;

for (const [path, result] of Object.entries(report.files ?? {})) {
  const counts = { detected: 0, survived: 0, noCoverage: 0, invalid: 0 };
  for (const mutant of result.mutants ?? []) {
    total += 1;
    if (mutant.status === 'Ignored' || mutant.status === 'CompileError') {
      counts.invalid += 1;
      continue;
    }
    valid += 1;
    if (mutant.status === 'Killed' || mutant.status === 'Timeout') {
      detected += 1;
      counts.detected += 1;
    } else if (mutant.status === 'Survived') {
      counts.survived += 1;
      survivors.push({ path, name: mutant.mutatorName, line: mutant.location?.start?.line });
    } else if (mutant.status === 'NoCoverage') {
      counts.noCoverage += 1;
    }
  }
  rows.push({ path, ...counts, score: counts.detected + counts.survived + counts.noCoverage === 0
    ? 100
    : (counts.detected / (counts.detected + counts.survived + counts.noCoverage)) * 100 });
}

const score = valid === 0 ? 0 : (detected / valid) * 100;
const lines = [
  '### 可靠性域变异测试',
  '',
  `| 变异体 | 有效 | 击杀（含超时） | 变异得分 |`,
  `|---|---|---|---|`,
  `| ${total} | ${valid} | ${detected} | **${score.toFixed(1)}%** |`,
  '',
  '| 文件 | 击杀 | 存活 | 未覆盖 | 得分 |',
  '|---|---|---|---|---|',
  ...rows.map(
    (row) =>
      `| ${row.path.replace(/^packages\/core\/src\/flow\/reliability\//, '')} | ${row.detected} | ${row.survived} | ${row.noCoverage} | ${row.score.toFixed(1)}% |`,
  ),
];

if (survivors.length > 0) {
  lines.push('', '<details><summary>存活变异体（前 15）</summary>', '');
  for (const item of survivors.slice(0, 15)) {
    lines.push(`- ${item.path}:${item.line} ${item.name}`);
  }
  lines.push('', '</details>');
}

console.log(lines.join('\n'));
