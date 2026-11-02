#!/usr/bin/env node
/**
 * ASCII 图宽度审计（CJK 双宽字符）
 *
 * Markdown 代码块里的手绘框线默认按字符数补空格；中文/日文/韩文/全角标点
 * 在等宽终端中占 2 列，按 1 列计算会导致右侧竖线与箭头错位。
 *
 * 本脚本扫描 blog/docs 中的 fenced code block：
 * 1. 按 East Asian Width 计算每行显示列宽；
 * 2. 对每个 `┌...┐` 框，检查框内以 `│` 结尾的行与顶边宽度一致；
 * 3. 输出不一致的行号与列差，退出码 1 表示存在错位。
 *
 * 用法：
 *   node scripts/check-ascii-width.mjs
 *   node scripts/check-ascii-width.mjs blog docs README.md
 *   node scripts/check-ascii-width.mjs --fix
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

/** 终端显示列宽（不含 ANSI；本仓库文档不含转义序列） */
export function displayWidth(text) {
  let width = 0;
  for (const char of text) {
    const cp = char.codePointAt(0);
    if (isZeroWidth(cp)) continue;
    width += isWide(cp) ? 2 : 1;
  }
  return width;
}

function isCjkBlock(lines) {
  return lines.some((line) => displayWidth(line) !== [...line].length);
}

function rightBorderWidth(line) {
  const trimmed = line.trimEnd();
  if (!/[│┐┘┤]$/.test(trimmed)) return null;
  return displayWidth(trimmed);
}

/** 返回代码块内的对齐问题；top 行索引基于块内 0-based */
function checkBlock(lines) {
  const issues = [];
  for (let top = 0; top < lines.length; top += 1) {
    const topLine = lines[top].trimEnd();
    if (!topLine.startsWith('┌') || !topLine.endsWith('┐')) continue;
    const expected = displayWidth(topLine);
    let bottom = -1;
    for (let i = top + 1; i < lines.length; i += 1) {
      const line = lines[i].trimEnd();
      if (line.startsWith('└') && line.endsWith('┘')) {
        bottom = i;
        break;
      }
      if (line.startsWith('┌') && line.endsWith('┐')) break;
    }
    if (bottom === -1) continue;

    const bottomWidth = displayWidth(lines[bottom].trimEnd());
    if (bottomWidth !== expected) {
      issues.push({
        line: top + 1,
        expected,
        actual: bottomWidth,
        kind: '底边',
        detail: lines[bottom],
      });
    }
    for (let i = top + 1; i < bottom; i += 1) {
      const width = rightBorderWidth(lines[i]);
      if (width === null) continue;
      if (width !== expected) {
        issues.push({
          line: i + 1,
          expected,
          actual: width,
          kind: '右边框',
          detail: lines[i],
        });
      }
    }
  }
  return issues;
}

/** 提取 markdown fenced code block；返回 {startLine, startIndex, endIndex, lines} */
function extractBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split(/\r?\n/);
  let current = null;
  let startLine = 0;
  let startIndex = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = /^```/.exec(line);
    if (!current && fence) {
      current = [];
      startLine = index + 2; // 代码块首行在文件中的 1-based 行号
      startIndex = index + 1;
      continue;
    }
    if (current && fence) {
      blocks.push({ startLine, startIndex, endIndex: index - 1, lines: current });
      current = null;
      continue;
    }
    if (current) current.push(line);
  }
  return blocks;
}

const BORDER = /[│┐┘┤]/g;

/** 行内最右侧边框字符的索引（可能后面还有箭头文字） */
function rightmostBorderIndex(line) {
  let last = -1;
  for (const match of line.matchAll(BORDER)) last = match.index;
  return last;
}

/** 同一代码块内按顶层框（行首仅空白 + ┌）逐框统一宽度 */
export function fixBlock(lines) {
  const fixed = [...lines];
  for (let top = 0; top < fixed.length; top += 1) {
    const topMatch = /^(\s*)┌[^\n]*┐\s*$/.exec(fixed[top]);
    if (!topMatch) continue;
    const indent = topMatch[1];
    let bottom = -1;
    for (let i = top + 1; i < fixed.length; i += 1) {
      if (new RegExp(`^${indent}└`).test(fixed[i]) && fixed[i].trimEnd().endsWith('┘')) {
        bottom = i;
        break;
      }
    }
    if (bottom === -1) continue;

    const rows = [];
    const openRows = [];
    for (let i = top; i <= bottom; i += 1) {
      const line = fixed[i];
      const edge = rightmostBorderIndex(line);
      if (edge !== -1 && line.slice(0, edge).trim() !== '') {
        rows.push({ index: i, edge, width: displayWidth(line.slice(0, edge + 1)) });
        continue;
      }
      if (new RegExp(`^${indent}│`).test(line)) {
        openRows.push({ index: i, width: displayWidth(line.trimEnd()) });
      }
    }
    if (rows.length === 0 && openRows.length === 0) continue;
    const target = Math.max(
      ...rows.map((row) => row.width),
      ...openRows.map((row) => row.width + 2),
    );

    for (const row of openRows) {
      const line = fixed[row.index].trimEnd();
      const pad = target - displayWidth(line) - 1;
      fixed[row.index] = `${line}${' '.repeat(pad)}│`;
    }

    for (const row of rows) {
      const line = fixed[row.index];
      const prefix = line.slice(0, row.edge);
      const edgeChar = line[row.edge];
      const suffix = line.slice(row.edge + 1);
      if (edgeChar === '│') {
        const bare = prefix.replace(/\s+$/, '');
        const pad = target - displayWidth(bare) - 1;
        if (pad >= 0) fixed[row.index] = `${bare}${' '.repeat(pad)}│${suffix}`;
      } else {
        const dash = /─*$/.exec(prefix);
        const head = prefix.slice(0, dash.index);
        const pad = target - displayWidth(prefix) - 1;
        if (pad >= 0) {
          fixed[row.index] = `${head}${'─'.repeat(dash[0].length + pad)}${edgeChar}${suffix}`;
        }
      }
    }
    top = bottom;
  }
  return fixed.join('\n') === lines.join('\n') ? lines : fixed;
}

function fixFile(file) {
  const markdown = readFileSync(file, 'utf8');
  const eol = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(/\r?\n/);
  const blocks = extractBlocks(markdown);
  let changed = 0;
  for (const block of blocks) {
    if (!isCjkBlock(block.lines)) continue;
    if (!block.lines.some((line) => /[┌└│┐┘]/.test(line))) continue;
    if (checkBlock(block.lines).length === 0) continue;
    const fixed = fixBlock(block.lines);
    if (fixed === block.lines) continue;
    fixed.forEach((line, offset) => {
      lines[block.startIndex + offset] = line;
    });
    changed += 1;
  }
  if (changed > 0) {
    writeFileSync(file, lines.join(eol), 'utf8');
  }
  return changed;
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
  const fix = args.includes('--fix');
  const paths = args.filter((arg) => arg !== '--fix');
  const targets = paths.length > 0 ? paths : DEFAULT_PATHS;
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

  if (fix) {
    let fixedFiles = 0;
    for (const file of files) fixedFiles += fixFile(file);
    console.log(`已修复 ${fixedFiles} 个文件中的 ASCII 图宽度。`);
    return;
  }

  let badBlocks = 0;
  let badLines = 0;
  for (const file of files) {
    const markdown = readFileSync(file, 'utf8');
    for (const block of extractBlocks(markdown)) {
      if (!isCjkBlock(block.lines)) continue;
      if (!block.lines.some((line) => /[┌└│┐┘]/.test(line))) continue;
      const issues = checkBlock(block.lines);
      if (issues.length === 0) continue;
      badBlocks += 1;
      badLines += issues.length;
      console.log(`\n${relative(ROOT, file).split(/\\/g).join('/')}（代码块起始行 ${block.startLine}）`);
      for (const issue of issues) {
        const delta = issue.actual - issue.expected;
        console.log(
          `  L${block.startLine + issue.line - 1} ${issue.kind}：显示宽度 ${issue.actual}，应为 ${issue.expected}（${delta > 0 ? '+' : ''}${delta}）`,
        );
        console.log(`    ${issue.detail}`);
      }
    }
  }

  if (badBlocks > 0) {
    console.error(`\n发现 ${badBlocks} 个代码块、${badLines} 行宽度错位；请按终端显示宽度补空格。`);
    process.exit(1);
  }
  console.log(`ASCII 图宽度检查通过：${files.length} 个 Markdown 文件。`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
