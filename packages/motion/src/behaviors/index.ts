import type { BehaviorDefinition } from '../contracts';
import { EAT_RICE, WAKE, WORK_FOCUS } from './daily';
import { FACE_AWAY } from './face-away';
import { BOW, CHIN_REST, HANDS_ON_HIPS, HUG, YAWN } from './gestures';
import { IDLE } from './idle';
import { LAND, LIFTED } from './lifted';
import { SLEEP } from './sleep';
import { SCOLD_FAT } from './social';
import { HEAD_PAT } from './touch';

export {
  BOW,
  CHIN_REST,
  EAT_RICE,
  FACE_AWAY,
  HANDS_ON_HIPS,
  HEAD_PAT,
  HUG,
  IDLE,
  LAND,
  LIFTED,
  SCOLD_FAT,
  SLEEP,
  WAKE,
  WORK_FOCUS,
  YAWN,
};

/** 内置行为注册表；剧本/控制器只引用这里的行为 id */
export const BEHAVIORS: readonly BehaviorDefinition[] = [
  IDLE,
  SLEEP,
  FACE_AWAY,
  LIFTED,
  LAND,
  // v3.0 内容扩容：触摸 / 日常 / 社交
  HEAD_PAT,
  EAT_RICE,
  WORK_FOCUS,
  WAKE,
  SCOLD_FAT,
  // P5.5：鞠躬 / 叉腰 / 托腮 / 打哈欠 / 拥抱
  BOW,
  HANDS_ON_HIPS,
  CHIN_REST,
  YAWN,
  HUG,
];
