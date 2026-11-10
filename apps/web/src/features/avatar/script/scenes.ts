/** v3.0 剧本引擎 T0.5：内置场景注册入口（后续环境/状态场景在此追加） */

import type { Scene } from '@wbfm/shared/schemas';
import { createSceneRegistry } from './registry';
import { TOUCH_SCENES } from './scenes/touch';

export const BUILT_IN_SCENES: readonly Scene[] = [...TOUCH_SCENES];

export const BUILT_IN_SCENE_REGISTRY = createSceneRegistry(BUILT_IN_SCENES);
