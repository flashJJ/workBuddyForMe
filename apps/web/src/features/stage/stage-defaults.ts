import type { StageBackground, StageScenePayload } from '@wbfm/shared/schemas';
import { BUILTIN_BACKGROUNDS } from './builtin-backgrounds';

/** 舞台默认背景：内置「剧场」渐变 */
export function defaultBackground(): StageBackground {
  const preset = BUILTIN_BACKGROUNDS[0]!;
  return {
    type: 'builtin',
    builtinId: preset.id,
    brightness: 1,
    blur: 0,
  };
}

/** 新场景/首演默认 payload：剧场背景 + 默认站位 + 无暖光 */
export function defaultScenePayload(): StageScenePayload {
  return {
    background: defaultBackground(),
    slots: {},
    cast: {},
    sceneZoom: 1,
    showDialog: true,
    showNameplates: true,
    warmFilter: { color: '#e8b06b', opacity: 0 },
  };
}
