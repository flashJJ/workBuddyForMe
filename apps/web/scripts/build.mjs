// v2.5 Next 15 构建包装器：
// 1) nft 会对 os.homedir() 做静态求值，把真实 ~/.workbuddy-for-me 下的模型/附件
//    写进 route trace；standalone 归集时再尝试创建
//    `.next/standalone/C:\Users\...\.workbuddy-for-me\...`（Windows 下 mkdir ENOENT）。
//    outputFileTracingExcludes 的路由级过滤在 Windows 会把 glob 经 path.join 转成
//    反斜杠，picomatch 不命中；因此构建期把 HOME/USERPROFILE 指向临时空目录，
//    让 nft 只能看到空的构建家目录。
// 2) 构建后扫描所有 .nft.json 与 standalone 目录：出现用户数据或盘符路径即失败，
//    作为打包门禁，防止后续 Next 升级/配置回退再次把用户数据带进安装包。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '..');
const nextDir = path.join(webDir, '.next');
const buildHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-next-build-home-'));
const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');

/** 盘符路径（如 C:/Users）或用户数据目录名 */
const DRIVE_PATH = /(^|[\\/])[A-Za-z]:[\\/]/;
const USER_DATA = /\.workbuddy-for-me/i;

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

function walkIllegalDirs(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (USER_DATA.test(entry.name) || /^[A-Za-z]:$/.test(entry.name)) acc.push(full);
    else walkIllegalDirs(full, acc);
  }
  return acc;
}

function assertStandaloneTrace() {
  const hits = [];
  for (const file of walkFiles(path.join(nextDir, 'server'))) {
    if (!file.endsWith('.nft.json')) continue;
    let trace;
    try {
      trace = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    for (const entry of trace.files ?? []) {
      if (USER_DATA.test(entry) || DRIVE_PATH.test(entry)) {
        hits.push(`${path.relative(webDir, file)} -> ${entry}`);
      }
    }
  }

  const illegalDirs = walkIllegalDirs(path.join(nextDir, 'standalone'));
  if (hits.length === 0 && illegalDirs.length === 0) {
    console.log('[v2.5] standalone trace 门禁通过：无用户数据/盘外路径');
    return;
  }

  console.error('\n[v2.5] standalone trace 门禁失败：用户数据或盘外路径被追踪进产物');
  for (const hit of hits.slice(0, 20)) console.error(`  trace: ${hit}`);
  for (const dir of illegalDirs.slice(0, 20)) console.error(`  dir:   ${dir}`);
  if (hits.length > 20 || illegalDirs.length > 20) {
    console.error(`  ...（共 ${hits.length} 条 trace / ${illegalDirs.length} 个目录）`);
  }
  process.exitCode = 1;
}

try {
  const result = spawnSync(process.execPath, [nextBin, 'build'], {
    cwd: webDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      // 构建期隔离用户家目录：避免 nft 把真实用户数据写进 trace
      USERPROFILE: buildHome,
      HOME: buildHome,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else {
    assertStandaloneTrace();
  }
} finally {
  fs.rmSync(buildHome, { recursive: true, force: true });
}
