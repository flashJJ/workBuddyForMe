// v0.9 打包 MCP stdio server 为单文件 CJS bin。
// 依赖全部 external（packages:'external'）：运行时从归集的 resources/server/node_modules
// 解析（与 Next standalone 同源，better-sqlite3 等原生 ABI 天然一致）。
// 产物 .next/mcp-server/mcp-server.cjs 由 desktop prepare-server.mjs 复制进 extraResources。
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '..');
const outDir = path.join(webDir, '.next', 'mcp-server');
const outFile = path.join(outDir, 'mcp-server.cjs');

fs.rmSync(outDir, { recursive: true, force: true });

await build({
  entryPoints: [path.join(webDir, 'src', 'server', 'mcp-stdio-bin.ts')],
  outfile: outFile,
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: false,
  // 不加 shebang：始终由归集的 node 二进制显式启动（跨平台 spawn 命令行更稳）
  logLevel: 'info',
});

if (process.platform !== 'win32') fs.chmodSync(outFile, 0o755);
console.log(`MCP stdio server 已输出：${path.relative(webDir, outFile)}`);
