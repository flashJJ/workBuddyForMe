// 打包前归集 Next standalone 产物到 resources/server
// 结构：resources/server/apps/web/server.js（与 standalone 内部相对路径一致）
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const webDir = path.join(repoRoot, 'apps', 'web');
const standaloneDir = path.join(webDir, '.next', 'standalone');
const serverEntry = path.join(standaloneDir, 'apps', 'web', 'server.js');
const target = path.join(desktopDir, 'resources', 'server');

if (!fs.existsSync(serverEntry)) {
  console.error('未找到 standalone 产物，请先执行 pnpm --filter @wbfm/web build');
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });

console.log(`复制 standalone → ${path.relative(repoRoot, target)}`);
fs.cpSync(standaloneDir, target, { recursive: true });

// 内置真实 Node 运行时：Electron fork 默认用 Electron 内置 Node（ABI 125），
// 与归集进来的 node_modules（Node 24 / ABI 137 编译的 better-sqlite3）不匹配，
// dlopen 直接失败。托管服务改用与构建同版本的真实 Node 启动，ABI 天然一致。
const nodeBin = process.platform === 'win32' ? 'node.exe' : 'node';
const nodeDir = path.join(target, 'node');
fs.mkdirSync(nodeDir, { recursive: true });
const nodeTarget = path.join(nodeDir, nodeBin);
fs.copyFileSync(process.execPath, nodeTarget);
if (process.platform !== 'win32') fs.chmodSync(nodeTarget, 0o755);
console.log(`已内置 Node 运行时 → ${path.relative(repoRoot, nodeTarget)}`);

// standalone 默认不含静态资源与 public，需手工补齐
const staticFrom = path.join(webDir, '.next', 'static');
const staticTo = path.join(target, 'apps', 'web', '.next', 'static');
if (fs.existsSync(staticFrom)) {
  fs.cpSync(staticFrom, staticTo, { recursive: true });
  console.log('已补齐 .next/static');
}

const publicFrom = path.join(webDir, 'public');
const publicTo = path.join(target, 'apps', 'web', 'public');
if (fs.existsSync(publicFrom)) {
  fs.cpSync(publicFrom, publicTo, { recursive: true });
  console.log('已补齐 public');
}

console.log('服务端资源归集完成');
