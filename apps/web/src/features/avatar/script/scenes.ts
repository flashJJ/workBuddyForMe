/** v3.0 剧本引擎 T0.6：内置场景注册入口（触摸 / 日常大戏 / 环境 / 状态） */

import type { Scene } from '@wbfm/shared/schemas';
import { createSceneRegistry } from './registry';
import { AMBIENT_SCENES } from './scenes/ambient';
import { MOMENT_SCENES } from './scenes/moments';
import { POOL_SCENES } from './scenes/pool';
import { STATE_SCENES } from './scenes/state';
import { TOUCH_SCENES } from './scenes/touch';

export const BUILT_IN_SCENES: readonly Scene[] = [
  ...TOUCH_SCENES,
  ...MOMENT_SCENES,
  ...AMBIENT_SCENES,
  ...STATE_SCENES,
  ...POOL_SCENES,
];

export const BUILT_IN_SCENE_REGISTRY = createSceneRegistry(BUILT_IN_SCENES);
