import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * v2.11：示例动作素材（内置 default VRMA）解析。
 * 顺序：环境变量覆盖 → 开发态 public/motions → standalone 归集后的 public/motions。
 * 缺失时返回 null，由能力包示例接口给出 422 可读原因。
 */
export function readSampleMotionAsset(): Uint8Array | null {
  const candidates = [
    process.env.WBFM_SAMPLE_MOTIONS_DIR,
    join(process.cwd(), 'public', 'motions'),
    join(process.cwd(), '.next', 'standalone', 'apps', 'web', 'public', 'motions'),
  ].filter((item): item is string => Boolean(item));

  for (const dir of candidates) {
    const file = join(dir, 'daiji.vrma');
    if (existsSync(file)) return new Uint8Array(readFileSync(file));
  }
  return null;
}
