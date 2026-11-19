#!/usr/bin/env node
/**
 * v4.11 P1-1：测试网络 mock 门禁（MSW 收敛）
 *
 * 规则：新增测试统一用 `tests/msw/server.ts` 的 handler；不再新增
 * `vi.stubGlobal('fetch', ...)`。存量文件按出现次数登记在基线，
 * 只允许减少（迁移到 MSW 后运行 --update 下调基线）。
 *
 * 用法：
 *   node scripts/check-msw.mjs            # 门禁
 *   node scripts/check-msw.mjs --update   # 迁移后下调基线
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(ROOT, 'scripts', '.msw-baseline.json');
const SCAN_DIRS = ['apps', 'packages'];
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
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;
const STUB_PATTERN = /stubGlobal\(\s*['"]fetch['"]/g;

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, acc);
    else if (TEST_FILE.test(entry)) acc.push(full);
  }
  return acc;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function countStubs(file) {
  const text = stripComments(readFileSync(file, 'utf8'));
  return (text.match(STUB_PATTERN) ?? []).length;
}

const counts = {};
for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const count = countStubs(file);
    if (count > 0) counts[relative(ROOT, file).split(sep).join('/')] = count;
  }
}

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(counts, null, 2)}\n`, 'utf8');
  console.log(`已更新基线：${Object.keys(counts).length} 个文件仍使用 stubGlobal('fetch')`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error('缺少 scripts/.msw-baseline.json；先运行 node scripts/check-msw.mjs --update');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const violations = [];
let reduced = 0;
for (const [file, count] of Object.entries(counts)) {
  const allowed = baseline[file] ?? 0;
  if (count > allowed) violations.push(`${file}：${allowed} → ${count}（新增 fetch stub）`);
}
for (const [file, allowed] of Object.entries(baseline)) {
  const count = counts[file] ?? 0;
  if (count < allowed) reduced += 1;
}

if (violations.length > 0) {
  console.error('MSW 收敛门禁失败：新增测试请使用 tests/msw/server.ts 的 handler');
  for (const item of violations) console.error(`  - ${item}`);
  process.exit(1);
}

console.log(
  `MSW 收敛检查通过：${Object.keys(counts).length} 个存量文件（可运行 --update 下调基线${reduced > 0 ? `，当前有 ${reduced} 个文件已减少` : ''}）`,
);
