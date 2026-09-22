import fs from 'node:fs';
import path from 'node:path';

/**
 * 读根 package.json 的 version 字段（备份 manifest 里需要）。
 * core 包可以通过相对路径回溯到 monorepo 根，不引入外部依赖。
 */
let cached: string | null = null;

export function getAppVersion(): string {
  if (cached) return cached;
  try {
    // packages/core/src/backup → 向上 3 层到仓库根
    const pkgPath = path.resolve(__dirname, '../../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version: string };
    cached = pkg.version;
  } catch {
    cached = 'unknown';
  }
  return cached;
}
