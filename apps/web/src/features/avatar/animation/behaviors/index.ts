import type { BehaviorDefinition } from '../contracts';
import { FACE_AWAY } from './face-away';
import { IDLE } from './idle';
import { LAND, LIFTED } from './lifted';
import { SLEEP } from './sleep';

export { FACE_AWAY, IDLE, LAND, LIFTED, SLEEP };

/** 内置行为注册表；剧本/控制器只引用这里的行为 id */
export const BEHAVIORS: readonly BehaviorDefinition[] = [IDLE, SLEEP, FACE_AWAY, LIFTED, LAND];
