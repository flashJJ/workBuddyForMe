#!/usr/bin/env node
/**
 * 300 行文件规模门禁（AC-2 / NFR-2）
 *
 * 扫描 apps/ 与 packages/ 下手写的 .ts/.tsx 文件，超过 300 行即判定失败。
 * 白名单（scripts/.lines-whitelist.json）仅允许配置/生成类文件，必须附理由。
 *
 * 用法：
 *   node scripts/check-file-lines.mjs             # 常规检查
 *   node scripts/check-file-lines.mjs --self-test # 内置自测
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, '..');
const LIMIT = 300;
const SCAN_DIRS = ['apps', 'packages'];
const IGNORED_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  '.next',
  'out',
  'coverage',
  'release',
  '.turbo',
  'test-results',
]);
const INCLUDE_EXTENSIONS = new Set(['.ts', '.tsx']);
const WHITELIST_NAME = '.lines-whitelist.json';

/** 递归收集待检查文件 */
function collectFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, acc);
    } else if (INCLUDE_EXTENSIONS.has(full.slice(full.lastIndexOf('.')))) {
      if (entry.endsWith('.d.ts')) continue;
      acc.push(full);
    }
  }
  return acc;
}

/** 统计物理行数（忽略文件末尾多余空行） */
function countLines(content) {
  if (content === '') return 0;
  const normalized = content.endsWith('\n') ? content.slice(0, -1) : content;
  return normalized.split(/\r?\n/).length;
}

function loadWhitelist(root) {
  const file = join(root, 'scripts', WHITELIST_NAME);
  if (!existsSync(file)) return new Map();
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const entries = Array.isArray(parsed) ? parsed : parsed.entries ?? [];
  const map = new Map();
  for (const item of entries) {
    if (!item?.path || !item.reason) {
      throw new Error(`白名单条目必须包含 path 与 reason：${JSON.stringify(item)}`);
    }
    map.set(item.path.split('/').join(sep), item.reason);
  }
  return map;
}

/** 执行检查，返回超限文件列表 */
export function runCheck(root, dirs = SCAN_DIRS) {
  const whitelist = loadWhitelist(root);
  const violations = [];
  for (const dirName of dirs) {
    for (const file of collectFiles(join(root, dirName))) {
      const rel = relative(root, file);
      const lines = countLines(readFileSync(file, 'utf8'));
      if (lines <= LIMIT) continue;
      if (whitelist.has(rel)) continue;
      violations.push({ file: rel, lines });
    }
  }
  return violations;
}

function printViolations(violations) {
  console.error(`\n发现 ${violations.length} 个文件超过 ${LIMIT} 行（NFR-2）：`);
  for (const v of violations) {
    console.error(`  ${v.lines} 行  ${v.file}`);
  }
  console.error('\n请拆分为子组件/纯函数模块；确属配置或生成文件的，在 scripts/.lines-whitelist.json 登记理由。');
}

function selfTest() {
  const temp = mkdtempSync(join(tmpdir(), 'wbfm-lines-'));
  try {
    const dir = join(temp, 'apps', 'web', 'src');
    mkdirSync(dir, { recursive: true });
    const write = (name, lines) =>
      writeFileSync(join(dir, name), `${Array.from({ length: lines }, (_, i) => `line ${i + 1}`).join('\n')}\n`);
    write('over.tsx', LIMIT + 1);
    write('exact.tsx', LIMIT);

    const first = runCheck(temp, ['apps']);
    const overFound = first.some((v) => v.file.endsWith('over.tsx'));
    const exactFound = first.some((v) => v.file.endsWith('exact.tsx'));
    if (!overFound || exactFound || first.length !== 1) {
      throw new Error(`自测失败：期望仅 over.tsx 超限，实际 ${JSON.stringify(first)}`);
    }

    const scriptsDir = join(temp, 'scripts');
    mkdirSync(scriptsDir, { recursive: true });
    writeFileSync(
      join(scriptsDir, WHITELIST_NAME),
      JSON.stringify([{ path: 'apps/web/src/over.tsx', reason: '自测白名单：模拟生成文件' }]),
    );
    const second = runCheck(temp, ['apps']);
    if (second.length !== 0) throw new Error(`自测失败：白名单未生效：${JSON.stringify(second)}`);

    console.log('check-file-lines 自测通过（超限检出 + 阈值边界 + 白名单放行）');
    return true;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const isSelfTest = process.argv.includes('--self-test');
if (isSelfTest) {
  selfTest();
} else {
  const violations = runCheck(ROOT);
  if (violations.length > 0) {
    printViolations(violations);
    process.exit(1);
  }
  console.log(`文件行数检查通过：所有手写 .ts/.tsx 文件均 ≤ ${LIMIT} 行。`);
}
