// app.asar 依赖完整性校验（供 verify-artifacts.ps1 调用）
//
// 背景：v2.22.0 的 CI 用 npx 调 electron-builder，包管理器被判定为 npm，pnpm hoisted
// 布局下只扫 apps/desktop/node_modules，漏收根级生产依赖，安装后启动即
// Cannot find module '@nut-tree-fork/nut-js'。
// 旧自检只核对 desktop 的顶层 dependencies，传递依赖（libnut 平台包、jimp 等）与
// app.asarUnpack 的原生 .node 都在盲区。
//
// 做法：以「asar 里实际存在的包」为准，逐个读取包内 package.json，核对它声明的
// dependencies 是否也在 asar 内。只看已打入的包，避免把 monorepo 根目录的 devDeps
// 误算成运行时依赖；optionalDependencies 允许缺失（electron-builder 会裁掉跨平台可选包）。
//
// 用法：node verify-asar-dependencies.mjs <app.asar> <desktop package.json> <app.asar.unpacked>
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

const [asarPath, desktopPkgPath, unpackedDir] = process.argv.slice(2);
if (!asarPath || !desktopPkgPath || !unpackedDir) {
  console.error('用法：node verify-asar-dependencies.mjs <app.asar> <package.json> <app.asar.unpacked>');
  process.exit(2);
}

const entries = asar.listPackage(asarPath);
/** 非 Windows 平台包允许缺失：electron-builder 会裁掉 darwin/linux/mac 平台二进制 */
const NON_WINDOWS_PACKAGE = /(darwin|linux|freebsd|android|mac-permissions)|win32-(ia32|arm64|arm)/;
const packageJsonDirs = entries
  .filter((entry) => /^\\node_modules\\(?:@[^\\]+\\[^\\]+|[^\\]+)\\package\.json$/.test(entry))
  .map((entry) => entry.replace(/^\\/, ''));

const failures = [];
const packageCache = new Map();

function readPackage(relativeEntry) {
  if (packageCache.has(relativeEntry)) return packageCache.get(relativeEntry);
  const parsed = JSON.parse(asar.extractFile(asarPath, relativeEntry).toString('utf8'));
  packageCache.set(relativeEntry, parsed);
  return parsed;
}

/** 在 asar 中查找依赖：允许同层与嵌套（node_modules/a/node_modules/b）两种位置 */
function findDependency(name) {
  const rel = `node_modules\\${name.replace(/\//g, '\\')}\\package.json`;
  return packageJsonDirs.find((candidate) => candidate === rel || candidate.endsWith(`\\${rel}`)) ?? null;
}

function requireDependencies(pkg, label) {
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    if (NON_WINDOWS_PACKAGE.test(name)) continue;
    if (!findDependency(name)) failures.push(`${label} 的依赖未打入 app.asar：${name}`);
  }
}

// 1) desktop 自身声明的生产依赖必须存在（v2.22.0 事故的直接判据）
const desktopPkg = JSON.parse(fs.readFileSync(desktopPkgPath, 'utf8'));
requireDependencies(desktopPkg, '@wbfm/desktop');

// 2) asar 内每个包的非可选依赖必须也存在，覆盖传递依赖与嵌套版本
for (const entry of packageJsonDirs) {
  const pkg = readPackage(entry);
  requireDependencies(pkg, pkg.name ?? entry);
}

// 3) asarUnpack 的原生模块必须真的落在 app.asar.unpacked
const nativeEntries = entries.filter((entry) => entry.endsWith('.node'));
if (nativeEntries.length === 0) {
  failures.push('app.asar 内没有 .node：asarUnpack 未生效或原生模块未被打包');
}
for (const entry of nativeEntries) {
  const relative = entry.replace(/^\\/, '').replace(/\\/g, path.sep);
  if (!fs.existsSync(path.join(unpackedDir, relative))) {
    failures.push(`原生模块未解包：${relative}`);
  }
}

if (failures.length > 0) {
  // 走 stdout：PowerShell 只捕获标准输出，stderr 会被当错误流丢掉
  for (const failure of failures) console.log(failure);
  process.exit(1);
}

console.log(`[ok] asar 生产依赖 ${packageJsonDirs.length} 个包（含传递）与 ${nativeEntries.length} 个原生模块校验通过`);
