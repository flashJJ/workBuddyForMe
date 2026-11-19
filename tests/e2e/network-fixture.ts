import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * v4.11 P1：E2E 联网夹具的共享常量（Playwright 配置与规格共用）。
 * 端口与验收脚本（43101）错开，避免同时运行冲突。
 */
export const FIXTURE_PORT = Number(process.env.WBFM_E2E_FIXTURE_PORT ?? 43102);
export const FIXTURE_URL = `http://127.0.0.1:${FIXTURE_PORT}`;

/**
 * 从当前工作目录向上找 pnpm 工作区根。
 * Playwright 可能从仓库根或 apps/web 启动，避免把相对路径写死在某一个 cwd 上。
 */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}
