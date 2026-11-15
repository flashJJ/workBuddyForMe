#!/usr/bin/env node
/**
 * 发布产物校验清单：SHA256SUMS.txt + build-info.json。
 *
 * 用法：
 *   node scripts/release-manifest.mjs                       # 默认 apps/desktop/release
 *   node scripts/release-manifest.mjs --dir <目录>
 *   node scripts/release-manifest.mjs --version 4.0.0
 *   node scripts/release-manifest.mjs --check --dir <目录>  # 复算校验和并核对构建信息
 *
 * 默认由 scripts/archive-installer.ps1 在归档完成后调用；
 * SHA256SUMS.txt 采用 coreutils 风格（小写哈希 + 两个空格 + 文件名），可用
 * `sha256sum -c SHA256SUMS.txt` 或 `certutil -hashfile` 复核。
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUMS_FILE = 'SHA256SUMS.txt';
const INFO_FILE = 'build-info.json';

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
  const hash = createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytes;
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(`release-manifest: ${message}`);
  process.exit(1);
}

const checkOnly = process.argv.includes('--check');
const dir = path.resolve(argValue('--dir', path.join(root, 'apps', 'desktop', 'release')));
const version = argValue('--version', readJson(path.join(root, 'package.json')).version);

if (!fs.existsSync(dir)) {
  fail(`目录不存在：${dir}（先执行 pnpm dist:win，或显式传 --dir）`);
}

const names = fs
  .readdirSync(dir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name !== SUMS_FILE && entry.name !== INFO_FILE)
  .map((entry) => entry.name)
  .sort();

if (names.length === 0) fail(`目录内没有可校验的产物：${dir}`);

const files = names.map((name) => {
  const file = path.join(dir, name);
  const stat = fs.statSync(file);
  return { name, bytes: stat.size, sha256: sha256(file), mtime: stat.mtime };
});

if (checkOnly) {
  const sumsPath = path.join(dir, SUMS_FILE);
  if (!fs.existsSync(sumsPath)) fail(`缺少 ${SUMS_FILE}：${dir}`);
  const expected = new Map();
  for (const line of fs.readFileSync(sumsPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64}) {2}(.+)$/);
    if (match) expected.set(match[2], match[1]);
  }

  let failed = 0;
  for (const file of files) {
    const want = expected.get(file.name);
    if (want === undefined) {
      console.error(`  缺失校验行：${file.name}`);
      failed += 1;
    } else if (want !== file.sha256) {
      console.error(`  哈希不一致：${file.name}\n    期望 ${want}\n    实际 ${file.sha256}`);
      failed += 1;
    }
  }
  for (const name of expected.keys()) {
    if (!names.includes(name)) {
      console.error(`  产物缺失：${name}`);
      failed += 1;
    }
  }

  const infoPath = path.join(dir, INFO_FILE);
  if (!fs.existsSync(infoPath)) {
    console.error(`  缺少 ${INFO_FILE}`);
    failed += 1;
  } else {
    const info = readJson(infoPath);
    if (info.version !== version) {
      console.error(`  版本不一致：build-info=${info.version} 期望=${version}`);
      failed += 1;
    }
    const listed = new Map((info.files ?? []).map((item) => [item.name, item.sha256]));
    for (const file of files) {
      if (listed.get(file.name) !== file.sha256) {
        console.error(`  build-info 哈希不一致：${file.name}`);
        failed += 1;
      }
    }
  }

  if (failed > 0) fail(`校验失败（${failed} 项）：${dir}`);
  console.log(`release-manifest: 校验通过 ${files.length} 个产物（${version}）`);
  process.exit(0);
}

const builtAt = new Date(
  files.reduce((latest, file) => Math.max(latest, file.mtime.getTime()), 0),
).toISOString();
const info = {
  app: 'WorkBuddyForMe',
  version,
  builtAt,
  generatedAt: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  commit: git(['rev-parse', 'HEAD']),
  branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
  files: files.map((file) => ({ name: file.name, bytes: file.bytes, sha256: file.sha256 })),
};

const sums = files.map((file) => `${file.sha256}  ${file.name}`).join('\n');
fs.writeFileSync(path.join(dir, INFO_FILE), `${JSON.stringify(info, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(dir, SUMS_FILE), `${sums}\n`, 'ascii');

console.log(`release-manifest: ${dir}`);
for (const file of files) {
  console.log(`  ${file.sha256.slice(0, 16)}…  ${(file.bytes / 1024 / 1024).toFixed(2)} MB  ${file.name}`);
}
console.log(`  已写入 ${SUMS_FILE} 与 ${INFO_FILE}（版本 ${version}，构建时间 ${builtAt}）`);
