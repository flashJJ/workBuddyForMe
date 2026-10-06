import path from 'node:path';
import { resolveDataPath } from '@wbfm/config';
import type { VoiceModelKind } from '@wbfm/voice';
import type { VoiceSettings } from '@wbfm/shared';

/** 语音模型根目录：用户自定义优先，否则数据根下 models/voice */
export function getVoiceModelsRoot(settings: VoiceSettings): string {
  const custom = settings.modelsDir?.trim();
  return custom && custom.length > 0 ? custom : resolveDataPath('models', 'voice');
}

/** 某类模型的本地目录（<root>/<modelId>） */
export function getModelDir(
  settings: VoiceSettings,
  kind: VoiceModelKind,
  modelId: string,
): string {
  return path.join(getVoiceModelsRoot(settings), modelId);
}
