import fs from 'node:fs';
import path from 'node:path';

/** 桌面端固定开发地址（Next dev server） */
export const DEV_SERVER_URL = 'http://127.0.0.1:3000';

/** 托管服务健康检查配置 */
export const HEALTH_TIMEOUT_MS = 30_000;
export const HEALTH_INTERVAL_MS = 250;
export const STOP_TIMEOUT_MS = 5_000;

/**
 * standalone server.js 路径：
 * - 打包后：resources/server/apps/web/server.js（electron-builder extraResources）
 * - 开发态：apps/web/.next/standalone/apps/web/server.js
 */
export function resolveServerPath(): string {
  if (process.env.WBFM_SERVER_PATH) return process.env.WBFM_SERVER_PATH;
  if (process.resourcesPath) {
    return path.join(process.resourcesPath, 'server', 'apps', 'web', 'server.js');
  }
  return path.resolve(__dirname, '..', '..', 'web', '.next', 'standalone', 'apps', 'web', 'server.js');
}

/**
 * 打包内置 Node 运行时（prepare-server.mjs 归集于 resources/server/node）：
 * 与 resources/server/node_modules 中原生模块（better-sqlite3）同 ABI 编译。
 * fork 托管服务必须用它而非 Electron 内置 Node（NODE_MODULE_VERSION 不同，
 * 否则 dlopen 失败）。未打包（开发/独立产物）时返回 null 回落 Electron 默认。
 */
export function resolveNodeRuntimePath(serverPath: string): string | null {
  const bin = process.platform === 'win32' ? 'node.exe' : 'node';
  const bundled = path.resolve(path.dirname(serverPath), '..', '..', 'node', bin);
  return fs.existsSync(bundled) ? bundled : null;
}

/** 生产态 preload 与入口同目录（tsup 产物 dist/preload/index.js） */
export function resolvePreloadPath(): string {
  return path.join(__dirname, 'preload', 'index.js');
}

/** 托管数据目录（SQLite/向量库/附件均落此处） */
export function resolveDataRoot(userDataDir: string): string {
  return process.env.WBFM_DATA_ROOT ?? path.join(userDataDir, 'data');
}

/** 测试可覆盖的 userData 目录（单实例锁/窗口状态/引导脚本均落此处） */
export function resolveUserDataDir(): string | null {
  return process.env.WBFM_USER_DATA_DIR ?? null;
}
