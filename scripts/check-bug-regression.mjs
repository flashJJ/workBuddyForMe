#!/usr/bin/env node
/**
 * 质量工程专项 F：Bug 记录表的回归用例引用校验。
 *
 * 规则：`docs/wiki/bug-registry.md` 中每条 B-xx 写出的 `*.test.ts` / `*.spec.ts`
 * 文件必须真实存在，避免修复记录引用了已改名/删除的用例。
 * 引用覆盖率只做观察输出，不阻断——历史条目允许暂时没有自动化回归。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = join(ROOT, 'docs', 'wiki', 'bug-registry.md');
const SCAN_DIRS = ['apps', 'packages', 'tests', 'scripts'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  'out',
  'coverage',
  'release',
  '.turbo',
  'test-results',
  'playwright-report',
  'resources',
]);
const FILE_REF = /([A-Za-z0-9._-]+\.(?:test|spec)\.(?:tsx|ts)(?![A-Za-z0-9]))/g;
const ROW = /^\|\s*(B-\d+)\s*\|/;

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const known = new Set();
for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    known.add(file.split(sep).pop());
  }
}

let total = 0;
let withReference = 0;
const missing = [];
for (const line of readFileSync(REGISTRY, 'utf8').split('\n')) {
  const row = line.match(ROW);
  if (!row) continue;
  total += 1;
  const names = [...new Set([...line.matchAll(FILE_REF)].map((hit) => hit[1]))];
  if (names.length > 0) withReference += 1;
  for (const name of names) {
    if (!known.has(name)) missing.push(`${row[1]}：${name}`);
  }
}

if (missing.length > 0) {
  console.error('Bug 回归引用校验失败：以下测试文件不存在');
  for (const item of missing) console.error(`  - ${item}`);
  process.exit(1);
}

console.log(
  `Bug 回归引用检查通过：${withReference}/${total} 条记录带测试引用，引用文件均存在`,
);
