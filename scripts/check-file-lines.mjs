#!/usr/bin/env node
/**
 * 文件规模门禁（AC-2 / NFR-2）
 *
 * 扫描 apps/ 与 packages/ 下手写的 .ts/.tsx 文件，两档判定：
 * - warning（≥260 行）：热点预警，列出但不阻断（exit 0），让撞 300 红线前可见；
 * - error（>300 行）：硬门禁，exit 1。
 * 白名单（scripts/.lines-whitelist.json）仅允许配置/生成类文件，必须附理由，对两档同时放行。
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
const WARN_LIMIT = 260;
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

/**
 * 执行检查，返回 { errors, warnings }：
 * - warnings：260–299 行（含边界，仅预警）；恰好 300 行为合规红线边界，不预警；
 * - errors：超过 300 行（硬门禁）。白名单对两档同时放行。
 */
export function runCheck(root, dirs = SCAN_DIRS) {
  const whitelist = loadWhitelist(root);
  const errors = [];
  const warnings = [];
  for (const dirName of dirs) {
    for (const file of collectFiles(join(root, dirName))) {
      const rel = relative(root, file);
      const lines = countLines(readFileSync(file, 'utf8'));
      if (whitelist.has(rel)) continue;
      if (lines > LIMIT) {
        errors.push({ file: rel, lines });
      } else if (lines >= WARN_LIMIT && lines < LIMIT) {
        warnings.push({ file: rel, lines });
      }
    }
  }
  return { errors, warnings };
}

function printWarnings(warnings) {
  if (warnings.length === 0) return;
  console.log(`\n预警：${warnings.length} 个文件达到 ${WARN_LIMIT} 行（建议拆分，不阻断）：`);
  for (const v of warnings) {
    console.log(`  ${v.lines} 行  ${v.file}`);
  }
  console.log('请择机抽纯函数/子组件拆分；确属技术阻塞的，在白名单登记并写明到期版本。');
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
    write('over.tsx', LIMIT + 1); // 301：error
    write('exact.tsx', LIMIT); // 300：不预警（< 260 档外，且未超红线）
    write('warm.tsx', 275); // 260–300：warning
    write('warm-edge.tsx', WARN_LIMIT); // 恰好 260：也应预警

    const first = runCheck(temp, ['apps']);
    const has = (list, name) => list.some((v) => v.file.endsWith(name));
    if (first.errors.length !== 1 || !has(first.errors, 'over.tsx')) {
      throw new Error(`自测失败：期望仅 over.tsx 报 error，实际 ${JSON.stringify(first.errors)}`);
    }
    if (
      first.warnings.length !== 2 ||
      !has(first.warnings, 'warm.tsx') ||
      !has(first.warnings, 'warm-edge.tsx') ||
      has(first.warnings, 'exact.tsx')
    ) {
      throw new Error(`自测失败：warning 档应含 warm/warm-edge 且不含 exact，实际 ${JSON.stringify(first.warnings)}`);
    }

    const scriptsDir = join(temp, 'scripts');
    mkdirSync(scriptsDir, { recursive: true });
    writeFileSync(
      join(scriptsDir, WHITELIST_NAME),
      JSON.stringify([
        { path: 'apps/web/src/over.tsx', reason: '自测白名单：模拟生成文件' },
        { path: 'apps/web/src/warm.tsx', reason: '自测白名单：模拟登记的技术阻塞' },
      ]),
    );
    const second = runCheck(temp, ['apps']);
    if (second.errors.length !== 0 || second.warnings.length !== 1 || !has(second.warnings, 'warm-edge.tsx')) {
      throw new Error(
        `自测失败：白名单应同时放行两档（仅剩 warm-edge 预警），实际 ${JSON.stringify(second)}`,
      );
    }

    console.log('check-file-lines 自测通过（300 硬门禁 + 260 预警档 + 阈值边界 + 白名单双档放行）');
    return true;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

const isSelfTest = process.argv.includes('--self-test');
if (isSelfTest) {
  selfTest();
} else {
  const { errors, warnings } = runCheck(ROOT);
  printWarnings(warnings);
  if (errors.length > 0) {
    printViolations(errors);
    process.exit(1);
  }
  console.log(`文件行数检查通过：所有手写 .ts/.tsx 文件均 ≤ ${LIMIT} 行（≥${WARN_LIMIT} 行已在上方预警列出）。`);
}
