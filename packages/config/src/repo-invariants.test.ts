import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 仓库不变量（TR-5.1）：
 * 数据根只能由 @wbfm/config 决定，其他包/应用禁止自行 homedir()、app.getPath
 * 或硬编码数据目录名，避免多入口路径漂移。
 * 例外：apps/desktop/src/main 为 Electron 主进程——userData 只能由 app.getPath
 * 获得（OS 约定），是除 config 外唯一允许的 OS 级路径所有者；其后的派生路径
 * （WBFM_DATA_ROOT）仍交由 config 的 resolveDataRoot 语义处理。
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');
const SCAN_ROOTS = ['packages', 'apps'];
const SOURCE_EXT = new Set(['.ts', '.tsx']);
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.next', 'release', '.turbo']);

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bhomedir\s*\(/g, label: 'homedir()' },
  { pattern: /app\.getPath\s*\(/g, label: 'app.getPath()' },
  { pattern: /\.workbuddy-for-me/g, label: '硬编码数据目录名' },
];

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, acc);
    else if (SOURCE_EXT.has(full.slice(full.lastIndexOf('.')))) acc.push(full);
  }
  return acc;
}

describe('集中式数据根不变量', () => {
  it('config 之外的源码不出现私有路径决策', () => {
    const offenders: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(join(REPO_ROOT, root))) {
        const normalized = file.replace(/\\/g, '/');
        if (normalized.includes('/packages/config/') || normalized.includes('.test.')) continue;
        // Electron 主进程 userData 例外（见文件头注释）
        if (normalized.includes('/apps/desktop/src/main/')) continue;
        const content = readFileSync(file, 'utf8');
        const labels = FORBIDDEN_PATTERNS.filter(({ pattern }) => pattern.test(content)).map(
          (hit) => hit.label,
        );
        if (labels.length > 0) offenders.push(`${normalized}: ${labels.join(', ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
