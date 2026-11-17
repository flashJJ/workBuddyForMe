#!/usr/bin/env node
/**
 * 表面层级门禁（v4.4 Surface System / S1）
 *
 * 目标：冻结存量裸表面类，禁止新增 `bg-card/xx`、`bg-background/xx` 这类局部透明度。
 * 组件应改用语义层级：bg-ui-canvas / chrome / card / row / control / overlay。
 *
 * 用法：
 *   node scripts/check-surfaces.mjs                 # 校验（默认 --check）
 *   node scripts/check-surfaces.mjs --write-baseline
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'apps', 'web', 'src');
const baselinePath = path.join(root, 'scripts', '.surfaces-baseline.json');

const PATTERNS = [
  { name: 'card', re: /^bg-card(?:\/\d+)?$/ },
  { name: 'background', re: /^bg-background(?:\/\d+)?$/ },
  { name: 'surface', re: /^bg-surface-\d(?:\/\d+)?$/ },
  { name: 'popover', re: /^bg-popover(?:\/\d+)?$/ },
];
/** 独立状态/装饰色：muted/accent/secondary 不进入表面层级（权重低于结构层级） */
const STATE_TOKENS = [/^bg-muted(?:\/\d+)?$/, /^bg-accent(?:\/\d+)?$/, /^bg-secondary(?:\/\d+)?$/];

const IGNORE_DIRS = new Set(['node_modules', '.next']);
/** 白名单：特殊渲染场景，原因必须写清，避免“为了过门禁而白名单” */
const WHITELIST = [
  ['features/stage/', '舞台沉浸式深色层，不参与主窗口表面层级'],
  ['features/pet/', '桌宠透明窗气泡，按窗口透明策略单独管理'],
  ['features/background/', '背景媒体/遮罩层本身'],
  ['app/spike/', '调试页'],
];

function isWhitelisted(rel) {
  return WHITELIST.some(([prefix]) => rel.startsWith(prefix));
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.(tsx|ts)$/.test(entry.name)) continue;
    if (/\.test\.(tsx|ts)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

function moduleOf(rel) {
  const parts = rel.split('/');
  if (parts[0] === 'features') return `features/${parts[1] ?? ''}`;
  if (parts[0] === 'components') return `components/${parts[1] ?? ''}`;
  if (parts[0] === 'app') return 'app';
  return parts[0] ?? 'other';
}

function countSurfaces(text) {
  let count = 0;
  // 只统计“基础类名”；hover:/focus:/data-[...]: 等交互状态和 muted/accent 装饰色不计入层级
  for (const raw of text.match(/[^\s"'`]+/g) ?? []) {
    const token = raw.replace(/[),;\]}]+$/, '');
    if (token.includes(':')) continue;
    if (STATE_TOKENS.some((re) => re.test(token))) continue;
    if (PATTERNS.some(({ re }) => re.test(token))) count += 1;
  }
  return count;
}

function scan() {
  const files = {};
  const modules = {};
  let total = 0;
  for (const full of walk(srcDir)) {
    const rel = path.relative(srcDir, full).replaceAll('\\', '/');
    if (isWhitelisted(rel)) continue;
    const count = countSurfaces(fs.readFileSync(full, 'utf8'));
    if (count === 0) continue;
    files[rel] = count;
    const mod = moduleOf(rel);
    modules[mod] = (modules[mod] ?? 0) + count;
    total += count;
  }
  return { files, modules, total };
}

const checkOnly = !process.argv.includes('--write-baseline');
const current = scan();

if (!checkOnly) {
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    note: 'v4.4 Surface System 存量基线：只允许下降，不允许新增裸表面类',
    total: current.total,
    files: Object.fromEntries(Object.entries(current.files).sort(([a], [b]) => a.localeCompare(b))),
  };
  fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`surface 基线已写入：${path.relative(root, baselinePath)}（${current.total} 处，${Object.keys(current.files).length} 个文件）`);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error('surface 门禁失败：缺少基线，请先运行 node scripts/check-surfaces.mjs --write-baseline');
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const baseFiles = baseline.files ?? {};
const violations = [];
for (const [file, count] of Object.entries(current.files)) {
  const allowed = baseFiles[file] ?? 0;
  if (count > allowed) violations.push({ file, count, allowed });
}

const top = Object.entries(current.modules)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .map(([mod, count]) => `${mod} ${count}`)
  .join('，');
console.log(`surface 统计：${current.total} 处（基线 ${baseline.total}）｜${top}`);

if (violations.length > 0) {
  console.error(`surface 门禁失败：${violations.length} 个文件新增裸表面类`);
  for (const item of violations.slice(0, 20)) {
    console.error(`  ${item.file}：${item.count} > 基线 ${item.allowed}`);
  }
  console.error('处理：改用 bg-ui-canvas/chrome/card/row/control/overlay；确属特殊场景请登记白名单并写明原因。');
  process.exit(1);
}

if (current.total < baseline.total) {
  console.log(`surface 门禁通过：存量较基线下降 ${baseline.total - current.total} 处，可择机运行 --write-baseline 下调。`);
} else {
  console.log('surface 门禁通过：存量未增长。');
}
