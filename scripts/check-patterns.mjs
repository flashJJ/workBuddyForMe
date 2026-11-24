#!/usr/bin/env node
/**
 * 质量工程专项 A：把缺陷预防手册（P1–P8）里可静态识别的代码信号变成门禁。
 *
 * 只阻止「新增」，历史问题记入 scripts/.patterns-baseline.json，不要求一次清零。
 * 与 packages/config/src/repo-invariants.test.ts 互补：
 * - repo-invariants 管「常量单一来源」等语义不变量；
 * - 本脚本管「危险写法」的文件级信号。
 *
 * P4（单例漂移）与 P5（测试隔离）由现有 reset 流程与 check:e2e-isolation 覆盖，
 * 这里不重复实现。
 *
 * 用法：
 *   pnpm audit:patterns                  # 检查新增
 *   pnpm audit:patterns --write-baseline # 重写基线
 *   pnpm audit:patterns --report         # 列出全部命中（不判失败）
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts', '.patterns-baseline.json');
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

const lineOf = (content, index) => content.slice(0, index).split('\n').length;

function scanMatches(content, regex) {
  const lines = [];
  for (const hit of content.matchAll(regex)) lines.push(lineOf(content, hit.index ?? 0));
  return lines;
}

/** 文件级规则：命中 presence 但整文件没有 absence 时，记录 presence 首次出现行 */
function scanMissing(content, presence, absence) {
  if (!presence.test(content)) return [];
  if (absence.test(content)) return [];
  presence.lastIndex = 0;
  const hit = presence.exec(content);
  return [lineOf(content, hit?.index ?? 0)];
}

const RULES = [
  {
    id: 'P1-schema-hardcoded-limit',
    hint: '用户可选上限提为 @wbfm/shared/constants 常量，schema/提交体/UI 引用同一常量',
    roots: ['packages/shared/src/schemas'],
    file: /\.ts$/,
    skip: /\.test\.ts$/,
    scan: (content) => scanMatches(content, /\.array\([^)]*\)\s*\.max\(\s*\d+/g),
  },
  {
    id: 'P2-spawn-without-kill',
    hint: '子进程需在成功/失败/超时三条路径回收，脚本结尾显式 process.exit',
    roots: ['scripts', 'apps/desktop/src'],
    file: /\.(mjs|js|ts)$/,
    skip: /\.test\.ts$/,
    scan: (content) =>
      scanMissing(content, /(?:^|[^\w.])(?:spawn|exec|execFile)\(/m, /\bkill(?:Process)?\s*\(/),
  },
  {
    id: 'P3-interval-without-clear',
    hint: 'setInterval 必须在卸载/终止事件里 clearInterval，避免后台常驻',
    roots: ['apps/web/src', 'packages/core/src'],
    file: /\.(ts|tsx)$/,
    skip: /\.test\.(ts|tsx)$/,
    scan: (content) => scanMissing(content, /\bsetInterval\s*\(/, /\bclearInterval\s*\(/),
  },
  {
    id: 'P6-test-port-out-of-range',
    hint: '端口落在 32768–60999 会与临时端口冲突，统一使用 32xxx 段',
    roots: ['tests', 'scripts', 'apps/web/playwright.config.ts'],
    file: /\.(ts|mjs|js|json)$/,
    skip: /\.test\.ts$/,
    scan: (content) =>
      scanMatches(content, /\bport\s*[:=]\s*(3[2-9]\d{3}|[4-6]\d{4})\b/g),
  },
  {
    id: 'P7-preload-non-electron-require',
    hint: 'sandbox 下 preload 只允许 require("electron") 与类型导入',
    roots: ['apps/desktop/src/preload'],
    file: /\.ts$/,
    skip: /\.test\.ts$/,
    scan: (content) =>
      [...content.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)]
        .filter((hit) => hit[1] !== 'electron')
        .map((hit) => lineOf(content, hit.index ?? 0)),
  },
  {
    id: 'P8-silent-catch',
    hint: '可忽略的异常必须写明原因，其余至少 console.warn 或上报',
    roots: ['apps/web/src', 'packages/core/src', 'packages/database/src'],
    file: /\.(ts|tsx)$/,
    skip: /\.test\.(ts|tsx)$/,
    scan: (content) => [
      ...scanMatches(content, /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g),
      ...scanMatches(content, /\.catch\(\s*\(\s*\)\s*=>\s*(?:\{\s*\}|undefined)\s*\)/g),
    ],
  },
];

function walk(target, acc = []) {
  if (!existsSync(target)) return acc;
  if (statSync(target).isFile()) {
    acc.push(target);
    return acc;
  }
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(target, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const keys = (ruleId, file) => `${ruleId}|${file}`;

function collect() {
  const findings = [];
  for (const rule of RULES) {
    for (const root of rule.roots) {
      for (const full of walk(join(ROOT, root))) {
        if (!rule.file.test(full)) continue;
        const file = relative(ROOT, full).split(sep).join('/');
        if (rule.skip.test(file)) continue;
        for (const line of rule.scan(readFileSync(full, 'utf8'))) {
          findings.push({ rule, file, line });
        }
      }
    }
  }
  return findings;
}

function loadBaseline() {
  if (!existsSync(BASELINE)) return null;
  return JSON.parse(readFileSync(BASELINE, 'utf8'));
}

function writeBaseline(findings) {
  const counts = {};
  for (const item of findings) {
    const key = keys(item.rule.id, item.file);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

const args = new Set(process.argv.slice(2));
const findings = collect();

if (args.has('--write-baseline')) {
  writeBaseline(findings);
  console.log(`模式基线已更新：${Object.keys(loadBaseline() ?? {}).length} 个文件命中`);
  process.exit(0);
}

if (args.has('--report')) {
  for (const item of findings) console.log(`${item.file}:${item.line}  ${item.rule.id}`);
  console.log(`共 ${findings.length} 处命中（仅报告，不阻断）`);
  process.exit(0);
}

const baseline = loadBaseline();
if (!baseline) {
  console.error('缺少模式基线：请先运行 pnpm audit:patterns --write-baseline');
  process.exit(1);
}

const seen = new Map();
const added = [];
for (const item of findings) {
  const key = keys(item.rule.id, item.file);
  const index = seen.get(key) ?? 0;
  seen.set(key, index + 1);
  if (index >= (baseline[key] ?? 0)) added.push(item);
}

if (added.length > 0) {
  console.error(`模式门禁失败：新增 ${added.length} 处危险写法`);
  for (const rule of RULES) {
    const items = added.filter((item) => item.rule.id === rule.id);
    if (items.length === 0) continue;
    console.error(`\n${rule.id}（${items.length}）`);
    console.error(`  处理：${rule.hint}`);
    for (const item of items) console.error(`  - ${item.file}:${item.line}`);
  }
  process.exit(1);
}

console.log(`模式门禁通过：${findings.length} 处历史命中均已在基线内，无新增`);
