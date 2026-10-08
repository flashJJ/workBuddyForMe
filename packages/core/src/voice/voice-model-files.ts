import fs from 'node:fs';
import type { VoiceModelKind, VoiceModelSpec } from '@wbfm/voice';
import type { VoiceSettings } from '@wbfm/shared/schemas';
import { getModelDir } from './model-paths';

/**
 * 模型文件磁盘齐备性扫描（从 voice-runtime.getModelStatus 原样搬出）：
 * 逐文件 stat 比对大小，缺失或尺寸不符（清单标注 size>0 时）记入 "specId/relPath"。
 * 以磁盘为准，DB 持久状态仅作展示补充；本函数不读写 DB。
 */
export function listMissingModelFiles(
  specs: readonly VoiceModelSpec[],
  settings: VoiceSettings,
  kind: VoiceModelKind,
): string[] {
  const missing: string[] = [];
  for (const spec of specs) {
    for (const f of spec.files) {
      const full = `${getModelDir(settings, kind, spec.id)}/${f.path}`;
      try {
        const size = fs.statSync(full).size;
        if (f.size > 0 && size !== f.size) missing.push(`${spec.id}/${f.path}`);
      } catch {
        missing.push(`${spec.id}/${f.path}`);
      }
    }
  }
  return missing;
}
