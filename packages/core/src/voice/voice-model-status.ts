import { VOICE_MODELS, type VoiceModelKind, type VoiceModelSpec } from '@wbfm/voice';
import type { VoiceModelFileStatus, VoiceSettings } from '@wbfm/shared/schemas';
import { listMissingModelFiles } from './voice-model-files';

export interface ModelStatusDeps {
  settings: VoiceSettings;
  ttsSpecs: readonly VoiceModelSpec[];
  activeSpec: VoiceModelSpec;
  syncReady: (kind: VoiceModelKind, spec: VoiceModelSpec, missing: string[]) => void;
}

/** 以磁盘为准计算 ASR/TTS 就绪状态；DB 状态同步通过 syncReady 注入 */
export async function readModelStatus(deps: ModelStatusDeps): Promise<VoiceModelFileStatus> {
  const checked = await Promise.all(
    (['asr', 'tts'] as const).map(async (kind) => {
      const list = kind === 'asr' ? [VOICE_MODELS.asr] : deps.ttsSpecs;
      return [kind, listMissingModelFiles(list, deps.settings, kind)] as const;
    }),
  );
  const asrMissing = checked.find(([k]) => k === 'asr')?.[1] ?? [];
  const ttsMissingAll = checked.find(([k]) => k === 'tts')?.[1] ?? [];

  // 磁盘已齐备但 DB 还停在 error/downloading：清掉旧状态，避免用户误以为还要重下。
  deps.syncReady('asr', VOICE_MODELS.asr, asrMissing);
  const ttsModels = deps.ttsSpecs.map((spec) => {
    const prefix = `${spec.id}/`;
    const ownMissing = ttsMissingAll
      .filter((p) => p.startsWith(prefix))
      .map((p) => p.slice(prefix.length));
    deps.syncReady('tts', spec, ownMissing);
    return {
      model: spec.engine ?? 'melo',
      label: spec.label,
      totalBytes: spec.totalBytes,
      ready: ownMissing.length === 0,
      missing: ownMissing,
    };
  });

  return {
    asrReady: asrMissing.length === 0,
    // 仅当前选中模型要求就绪；另一套缺失不阻塞朗读
    ttsReady: ttsModels.find((m) => m.model === deps.activeSpec.engine)?.ready ?? false,
    asrMissing,
    ttsMissing: ttsModels.find((m) => m.model === deps.activeSpec.engine)?.missing ?? [],
    asrTotalBytes: VOICE_MODELS.asr.totalBytes,
    ttsTotalBytes: deps.activeSpec.totalBytes,
    ttsModels,
    activeTtsModel: deps.activeSpec.engine ?? 'melo',
  };
}
