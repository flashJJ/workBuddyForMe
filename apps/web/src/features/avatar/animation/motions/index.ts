import type { MotionDefinition } from '../contracts';
import { GLANCE } from './glance';
import { NOD } from './nod';
import { TILT } from './tilt';

export { GLANCE, NOD, TILT };

/** 内置动作注册表；数据只引用 contracts 里的 id */
export const MOTIONS: readonly MotionDefinition[] = [NOD, TILT, GLANCE];
