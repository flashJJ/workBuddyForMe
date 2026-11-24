import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * v5.1 文件安全契约：
 * tools 目录里的文件写/删/移必须经过 FileGuard；artifact_write 走受控产物目录，
 * spill 是内部结果缓存，二者在 allowlist 内。新增工具若直接写盘，这里会失败。
 */

const TOOLS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST = new Set(['artifact/artifact-write-tool.ts', 'spill.ts']);
const FS_WRITE = /\b(?:writeFileSync|writeFile|unlinkSync|renameSync|rmSync)\s*\(/;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'contract' || entry === '__tests__') continue;
      walk(full, acc);
    } else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('v5.1 文件工具守卫契约', () => {
  it('直接写盘的工具必须接入 FileGuard', () => {
    const offenders: string[] = [];
    for (const file of walk(TOOLS_DIR)) {
      const relative = file.slice(TOOLS_DIR.length + 1).split('\\').join('/');
      if (ALLOWLIST.has(relative)) continue;
      const content = readFileSync(file, 'utf8');
      if (!FS_WRITE.test(content)) continue;
      if (!content.includes('fileGuard')) offenders.push(relative);
    }
    expect(offenders).toEqual([]);
  });
});
