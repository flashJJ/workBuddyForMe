#!/usr/bin/env node
/**
 * 质量工程专项 E：变更影响面。
 *
 * 用 git diff（含未跟踪文件）找出改动文件，映射到工作区包，再沿 package.json
 * 的 workspace 依赖反向扩散，得到最小测试集合。CI 仍跑全量，本地 pre-push 用它省时间。
 *
 * 用法：
 *   pnpm test:impact                 # 对比 HEAD（工作区改动）
 *   pnpm test:impact --base=main     # 对比分支
 *   pnpm test:impact --run           # 直接串行执行建议命令
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const baseArg = args.find((item) => item.startsWith('--base='));
const BASE = baseArg ? baseArg.slice('--base='.length) : 'HEAD';
const RUN = args.includes('--run');

/** 从 pnpm-workspace.yaml 读取包目录通配（仓库只用了 apps/* 与 packages/*） */
function workspacePatterns() {
  const file = join(ROOT, 'pnpm-workspace.yaml');
  if (!existsSync(file)) return ['apps/*', 'packages/*'];
  const patterns = [...readFileSync(file, 'utf8').matchAll(/^\s*-\s*["']?([^"'\n]+)["']?\s*$/gm)].map(
    (hit) => hit[1].trim(),
  );
  return patterns.length > 0 ? patterns : ['apps/*', 'packages/*'];
}

/** 收集工作区包：目录、包名、workspace 依赖 */
function collectPackages() {
  const packages = [];
  for (const pattern of workspacePatterns()) {
    const base = pattern.replace(/\/\*$/, '');
    const dir = join(ROOT, base);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue;
      const pkgDir = join(dir, entry.name);
      const file = join(pkgDir, 'package.json');
      if (!existsSync(file)) continue;
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      const deps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
        ...(pkg.peerDependencies ?? {}),
      };
      packages.push({
        dir: pkgDir,
        dirRel: relative(ROOT, pkgDir).split(sep).join('/'),
        name: pkg.name,
        scripts: pkg.scripts ?? {},
        workspaceDeps: Object.keys(deps).filter((name) => deps[name]?.startsWith('workspace:')),
      });
    }
  }
  return packages;
}

function gitLines(gitArgs) {
  const result = spawnSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8', shell: false });
  if (result.status !== 0) {
    console.error(`git ${gitArgs.join(' ')} 失败：${(result.stderr ?? '').trim()}`);
    process.exit(1);
  }
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

const changed = [
  ...gitLines(['diff', '--name-only', BASE]),
  ...gitLines(['ls-files', '--others', '--exclude-standard']),
].map((file) => file.split(sep).join('/'));

if (changed.length === 0) {
  console.log(`相对 ${BASE} 没有改动，无需定向测试`);
  process.exit(0);
}

const packages = collectPackages();
const ownerOf = (file) =>
  packages
    .filter((pkg) => file === pkg.dirRel || file.startsWith(`${pkg.dirRel}/`))
    .sort((a, b) => b.dirRel.length - a.dirRel.length)[0];

const affected = new Set();
const touchedRoot = [];
for (const file of changed) {
  const owner = ownerOf(file);
  if (owner) affected.add(owner.name);
  else touchedRoot.push(file);
}

// 反向依赖扩散：依赖方也必须跑
let growing = true;
while (growing) {
  growing = false;
  for (const pkg of packages) {
    if (affected.has(pkg.name)) continue;
    if (pkg.workspaceDeps.some((dep) => affected.has(dep))) {
      affected.add(pkg.name);
      growing = true;
    }
  }
}

const commands = [];
if (touchedRoot.length > 0) commands.push('pnpm check');
for (const pkg of packages) {
  if (!affected.has(pkg.name)) continue;
  if (pkg.scripts['test:unit']) commands.push(`pnpm --filter ${pkg.name} test:unit`);
  else if (pkg.scripts.test) commands.push(`pnpm --filter ${pkg.name} test`);
}

console.log(`改动文件 ${changed.length} 个，影响包：${[...affected].join(', ') || '（仅根目录）'}`);
if (touchedRoot.length > 0) {
  console.log(`根目录/脚本改动：${touchedRoot.slice(0, 8).join(', ')}${touchedRoot.length > 8 ? '…' : ''}`);
}
if (commands.length === 0) {
  console.log('未匹配到可执行测试命令，建议至少运行 pnpm check');
  process.exit(0);
}

console.log('\n建议命令：');
for (const command of commands) console.log(`  ${command}`);

if (!RUN) process.exit(0);

for (const command of commands) {
  console.log(`\n$ ${command}`);
  const [bin, ...rest] = command.split(' ');
  const result = spawnSync(bin, rest, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
