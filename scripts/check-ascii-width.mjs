#!/usr/bin/env node
/**
 * Markdown 框图渲染对齐检查（中文双宽 + 字体列宽不可假设）
 *
 * 代码块按「中文=2 列」补空格只能保证标准宽度一致；实际预览字体里中文
 * 可能只占 ~1.7 个等宽列，含中文的闭合右边框、横线里的中文标题都会错位。
 * 因此本脚本不再计算「补几个空格」，而是检查结构本身是否依赖字体列宽：
 *
 * 1. 含中文的代码块禁止闭合框：不出现 `┐` / `┘` / `┤`，不允许 CJK 行尾挂 `│`；
 * 2. 禁止结构线（`│┌└├┬┴┼`）出现在中文之后（其列位置会随中文字宽漂移）；
 * 3. 禁止横线中夹中文标题（`┌──── 标题 ────`）；
 * 4. 同一开放框的上下横线宽度必须一致；
 * 5. `┬` 交点与下一行 `▼` 的显示列必须一致。
 *
 * 用法：
 *   node scripts/check-ascii-width.mjs
 *   node scripts/check-ascii-width.mjs blog docs README.md
 *
 * 修复方式：流程图/拓扑图改 Mermaid；UI 草图/分层表改右侧开放框。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const DEFAULT_PATHS = ['blog', 'docs', 'README.md'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'release', 'out', 'coverage', '.git']);

/** 组合字符/零宽字符 */
function isZeroWidth(cp) {
  return (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0xfe20 && cp <= 0xfe2f) ||
    (cp >= 0xe0100 && cp <= 0xe01ef)
  );
}

/** East Asian Width = Wide/Fullwidth（终端占 2 列） */
function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xa960 && cp <= 0xa97f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1b000 && cp <= 0x1b001) ||
    (cp >= 0x1f200 && cp <= 0x1f251) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/** 终端显示列宽（本仓库文档不含 ANSI 转义） */
export function displayWidth(text) {
  let width = 0;
  for (const char of text) {
    const cp = char.codePointAt(0);
    if (isZeroWidth(cp)) continue;
    width += isWide(cp) ? 2 : 1;
  }
  return width;
}

const hasWide = (text) => displayWidth(text) !== [...text].length;
const STRUCTURAL = /[│┌└├┬┴┼]/g;
const HORIZONTAL = /[─┬┴┼┐┘┤]/g;
const BOX = /[┌│└┐┘┬┴├┤┼]/;

function isCjkBlock(lines) {
  return lines.some((line) => hasWide(line));
}

/** 返回代码块内的对齐问题；top 为块内 0-based */
function checkBlock(lines) {
  const issues = [];
  const push = (line, kind, detail) => issues.push({ line, kind, detail });

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();

    // 1. 闭合框：右角、右边框
    if (/[┐┘┤]/.test(line)) {
      push(index, '闭合右边', line);
    }
    if (line.endsWith('│') && hasWide(line.slice(0, -1))) {
      push(index, '中文行尾右边框', line);
    }

    // 2. 结构线必须只出现在 ASCII 之后（列位置不随中文字宽漂移）
    for (const match of line.matchAll(STRUCTURAL)) {
      if (hasWide(line.slice(0, match.index))) {
        push(index, '结构线前有中文', line);
        break;
      }
    }

    // 3. 横线里夹中文标题：标题后的 `─` 会随字宽改变横线长度
    const boxStart = line.indexOf('┌');
    if (boxStart !== -1) {
      for (const match of line.matchAll(HORIZONTAL)) {
        if (match.index > boxStart && hasWide(line.slice(boxStart, match.index))) {
          push(index, '横线夹中文', line);
          break;
        }
      }
    }
  });

  // 4/5. 开放框：上下横线等宽、┬ 与 ▼ 同列
  for (let top = 0; top < lines.length; top += 1) {
    const topLine = lines[top].trimEnd();
    if (!/^\s*┌/.test(topLine)) continue;
    let bottom = -1;
    for (let i = top + 1; i < lines.length; i += 1) {
      const line = lines[i].trimEnd();
      if (/^\s*┌/.test(line)) break;
      if (/^\s*└/.test(line)) {
        bottom = i;
        break;
      }
    }
    if (bottom === -1) {
      push(top, '开放框缺底边', topLine);
      continue;
    }
    if (displayWidth(lines[bottom].trimEnd()) !== displayWidth(topLine)) {
      push(top, '上下横线不等宽', topLine);
    }
    const caret = lines[bottom].indexOf('┬');
    if (caret !== -1) {
      const column = displayWidth(lines[bottom].slice(0, caret));
      const next = (lines[bottom + 1] ?? '').trimEnd();
      const arrow = next.indexOf('▼');
      if (arrow === -1 || displayWidth(next.slice(0, arrow)) !== column) {
        push(bottom, '箭头不在交点列', lines[bottom]);
      }
    }
    top = bottom;
  }

  return issues;
}

/** 提取 markdown fenced code block；startLine 为代码块首行在文件中的 1-based 行号 */
function extractBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split(/\r?\n/);
  let startLine = 0;
  let current = null;
  for (let index = 0; index < lines.length; index += 1) {
    const fence = /^```/.exec(lines[index]);
    if (!current && fence) {
      current = [];
      startLine = index + 2;
      continue;
    }
    if (current && fence) {
      blocks.push({ startLine, lines: current });
      current = null;
      continue;
    }
    if (current) current.push(lines[index]);
  }
  return blocks;
}

function collectMarkdown(dir, acc = []) {
  if (SKIP_DIRS.has(dir.split(/[\\/]/).pop())) return acc;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) collectMarkdown(full, acc);
    else if (entry.endsWith('.md')) acc.push(full);
  }
  return acc;
}

function main() {
  const args = process.argv.slice(2);
  const targets = args.length > 0 ? args : DEFAULT_PATHS;
  const files = [];
  for (const path of targets) {
    const full = resolve(ROOT, path);
    try {
      if (statSync(full).isDirectory()) collectMarkdown(full, files);
      else if (full.endsWith('.md')) files.push(full);
    } catch {
      console.error(`跳过不存在路径：${path}`);
    }
  }

  let badBlocks = 0;
  let badIssues = 0;
  for (const file of files) {
    const markdown = readFileSync(file, 'utf8');
    for (const block of extractBlocks(markdown)) {
      if (!isCjkBlock(block.lines)) continue;
      if (!block.lines.some((line) => BOX.test(line))) continue;
      const issues = checkBlock(block.lines);
      if (issues.length === 0) continue;
      badBlocks += 1;
      badIssues += issues.length;
      console.log(`\n${relative(ROOT, file).split(/\\/g).join('/')}（代码块起始行 ${block.startLine}）`);
      for (const issue of issues) {
        console.log(`  L${block.startLine + issue.line - 1} ${issue.kind}`);
        console.log(`    ${issue.detail}`);
      }
    }
  }

  if (badBlocks > 0) {
    console.error(
      `\n发现 ${badBlocks} 个代码块、${badIssues} 处渲染风险：流程图/拓扑图改 Mermaid，UI 草图/分层表改右侧开放框。`,
    );
    process.exit(1);
  }
  console.log(`框图结构检查通过：${files.length} 个 Markdown 文件。`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
