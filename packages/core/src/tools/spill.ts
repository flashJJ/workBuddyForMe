import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDataDir } from '@wbfm/config';

/**
 * v2.9 大工具输出溢出：
 * - 超过阈值写入内容寻址文件 `spills/<sha256>.txt`（幂等，不重复落盘）；
 * - 模型只看到预览 + `spill://<sha256>` 引用，UI 走 /api/spills/:hash 看全文。
 */

/** 阈值高于常规工具压缩预算，避免和 v1.1 大输出压缩互相抢占 */
export const SPILL_THRESHOLD_CHARS = 100_000;
export const SPILL_PREVIEW_CHARS = 2_000;
export const SPILL_DIR_NAME = 'spills';

function spillDir(): string {
  const dir = getDataDir(SPILL_DIR_NAME);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function spillHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export interface SpillResult {
  output: string;
  ref: string | null;
}

/** 输出超阈值时替换为预览 + spill 引用；否则原样返回 */
export function maybeSpillOutput(output: string): SpillResult {
  if (output.length <= SPILL_THRESHOLD_CHARS) return { output, ref: null };
  const hash = spillHash(output);
  const file = join(spillDir(), `${hash}.txt`);
  if (!existsSync(file)) writeFileSync(file, output, 'utf8');
  const preview = output.slice(0, SPILL_PREVIEW_CHARS);
  return {
    output: `${preview}\n\n[输出过长，已溢出到 spill://${hash}（原 ${output.length} 字符）]`,
    ref: `spill://${hash}`,
  };
}

/** 读取溢出全文（仅接受 64 位 hex 哈希，防路径穿越） */
export function readSpill(hash: string): string | null {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  const file = join(getDataDir(SPILL_DIR_NAME), `${hash}.txt`);
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8');
}
