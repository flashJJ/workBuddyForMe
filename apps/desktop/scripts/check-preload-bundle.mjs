/**
 * 打包门禁：sandbox:true 的 preload 只能 require('electron')。
 * 从共享包取运行时代码会把其依赖（如 zod）留成 require，preload 加载即失败，
 * 表现为 window.wbfm 缺失 → 渲染层无托管 token → 全站 API 401（B-59）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, '..', 'dist', 'preload');
const bundles = fs
  .readdirSync(distDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(distDir, name));
if (bundles.length === 0) {
  console.error(`preload 产物不存在：${distDir}（先执行 tsup）`);
  process.exit(1);
}

let failed = false;
for (const bundle of bundles) {
  const text = fs.readFileSync(bundle, 'utf8');
  const requires = [...new Set([...text.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]))];
  const forbidden = requires.filter((name) => name !== 'electron');
  if (forbidden.length > 0) {
    failed = true;
    console.error(`preload 产物包含不可用的外部依赖：${bundle} → ${forbidden.join(', ')}`);
  } else {
    console.log(`preload 门禁通过：${path.basename(bundle)} require = ${requires.join(', ') || '(none)'}`);
  }
}
if (failed) {
  console.error('sandbox 化 preload 只能 require("electron")，请改为内联常量/纯函数或 type-only import。');
  process.exit(1);
}
