#!/usr/bin/env node
/**
 * Kokoro manifest 同步工具。
 *
 * - 固定 revision，不跟随 main；
 * - 只对关键大文件写精确 size + LFS SHA256，小文件保持 size=0（仅校验存在性）；
 * - `--check` 比对本地清单，`--write` 覆盖生成文件。
 *
 * 用法：
 *   node scripts/voice/sync-kokoro-manifest.mjs --check
 *   node scripts/voice/sync-kokoro-manifest.mjs --write
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const REPO = 'csukuangfj/kokoro-multi-lang-v1_1';
const REVISION = '423bfb9ccd6a66115a76602a9630ffea265ae176';
const BASE = (process.env.HF_BASE ?? 'https://hf-mirror.com').replace(/\/+$/, '');
const OUT = path.resolve('packages/voice/src/models/manifest-kokoro-files.ts');

/** 不参与运行时校验的仓库元文件 */
const SKIP_PATHS = new Set(['.gitattributes']);

/** 需要精确 size 的文件（其余文件 size=0，仅校验存在性） */
const EXACT_SIZE_PATHS = new Set([
  'date-zh.fst',
  'lexicon-gb-en.txt',
  'lexicon-us-en.txt',
  'lexicon-zh.txt',
  'model.onnx',
  'number-zh.fst',
  'phone-zh.fst',
  'tokens.txt',
  'voices.bin',
]);

/** 需要 SHA256 的 LFS 大文件 */
const SHA256_PATHS = new Set([
  'lexicon-us-en.txt',
  'lexicon-zh.txt',
  'model.onnx',
  'voices.bin',
]);

const CHECK = process.argv.includes('--check');
const WRITE = process.argv.includes('--write');

function fail(message) {
  console.error(`sync-kokoro-manifest: ${message}`);
  process.exit(1);
}

function sortPath(a, b) {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

async function fetchTree() {
  const url = `${BASE}/api/models/${REPO}/tree/${REVISION}?recursive=true`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) fail(`tree API HTTP ${res.status}: ${url}`);
  const entries = await res.json();
  if (!Array.isArray(entries)) fail('tree API 返回不是数组');
  return entries
    .filter((entry) => entry.type === 'file' && !SKIP_PATHS.has(entry.path))
    .sort(sortPath);
}

function render(files) {
  const lines = files.map((file) => {
    const size = EXACT_SIZE_PATHS.has(file.path) ? file.size : 0;
    const sha = SHA256_PATHS.has(file.path) ? file.lfs?.oid : undefined;
    if (SHA256_PATHS.has(file.path) && !sha) fail(`缺少 LFS oid: ${file.path}`);
    const hashPart = sha ? `, sha256: '${sha}'` : '';
    return `  { path: '${file.path}', size: ${size}${hashPart} },`;
  });
  return [
    '// 自动生成（HF tree API）：Kokoro 中英多说话人 TTS 文件清单。',
    `// 生成依据：${REPO} @ ${REVISION}`,
    `// 生成时间：${new Date().toISOString()}`,
    '// 大文件带精确字节校验；espeak-ng-data/dict 小文件 size=0 仅校验存在性。',
    "import type { VoiceModelFile } from './manifest';",
    '',
    'export const KOKORO_FILES: VoiceModelFile[] = [',
    ...lines,
    '];',
    '',
  ].join('\n');
}

function parseRows(text) {
  const rows = [];
  const re = /\{ path: '([^']+)', size: (\d+)(?:, sha256: '([^']+)')? \}/g;
  for (const match of text.matchAll(re)) {
    rows.push({ path: match[1], size: Number(match[2]), sha256: match[3] ?? null });
  }
  return rows;
}

async function main() {
  const files = await fetchTree();
  if (files.length === 0) fail('tree API 返回 0 个文件');
  const generated = render(files);

  if (WRITE) {
    await fs.writeFile(OUT, generated, 'utf8');
    console.log(`wrote ${files.length} files -> ${path.relative(process.cwd(), OUT)}`);
    return;
  }

  const existing = await fs.readFile(OUT, 'utf8').catch(() => '');
  const expected = parseRows(generated);
  const actual = parseRows(existing);
  const diffs = [];
  if (expected.length !== actual.length) {
    diffs.push(`数量不同：本地 ${actual.length}，上游 ${expected.length}`);
  }
  const max = Math.max(expected.length, actual.length);
  for (let i = 0; i < max; i++) {
    const e = expected[i];
    const a = actual[i];
    if (!e || !a || e.path !== a.path || e.size !== a.size || e.sha256 !== a.sha256) {
      diffs.push(`#${i + 1}: 本地 ${JSON.stringify(a)} ≠ 上游 ${JSON.stringify(e)}`);
      if (diffs.length >= 10) break;
    }
  }

  if (CHECK) {
    if (diffs.length > 0) {
      console.error(diffs.join('\n'));
      fail(`manifest 与上游不一致（${REVISION}）`);
    }
    console.log(`ok: ${files.length} files @ ${REVISION}`);
    return;
  }

  console.log(`files=${files.length} revision=${REVISION}`);
  console.log(`diff=${diffs.length > 0 ? 'yes' : 'no'}`);
  if (diffs.length > 0) console.log(diffs.join('\n'));
}

await main();
