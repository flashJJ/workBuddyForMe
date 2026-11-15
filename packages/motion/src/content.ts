/**
 * v3.1：动效内容快照（一次会话固定一份）。
 *
 * 默认快照直接引用内置静态注册表，不拷贝、不改变现有观感；
 * 内容注入方（测试或后续内容包）传入自己的 poses / motions / behaviors 即可。
 */
import type { BehaviorDefinition, MotionDefinition, PoseDefinition } from './contracts';
import { BEHAVIORS } from './behaviors';
import { MOTIONS } from './motions';
import { POSES } from './poses';

export interface MotionContent {
  /** 内容版本号：调用方用于固定一次会话的快照，内容变化时由注入方递增 */
  version: string;
  poses: readonly PoseDefinition[];
  motions: readonly MotionDefinition[];
  behaviors: readonly BehaviorDefinition[];
}

export const DEFAULT_MOTION_CONTENT: MotionContent = {
  version: 'builtin',
  poses: POSES,
  motions: MOTIONS,
  behaviors: BEHAVIORS,
};
