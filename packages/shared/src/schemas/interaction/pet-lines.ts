/**
 * 桌宠本地台词池（随机抽取，零模型调用）。
 *
 * 与 interaction-chains 分离：动作链只引用 pool id，词条仍留在 i18n，
 * 因此新增/翻译台词不需要改动作逻辑。
 */

import type { MessageKey } from '../../i18n/index';

export type PetLinePoolId =
  | 'first-meet'
  | 'head-tap'
  | 'head-longpress'
  | 'body-tap'
  | 'body-longpress'
  | 'body-double'
  | 'raised'
  | 'cheer'
  | 'ambient'
  | 'late-night'
  | 'idle-long'
  | 'hungry'
  | 'eat-rice'
  | 'work-rest'
  | 'called-fat';

export const PET_LINE_POOLS: Record<PetLinePoolId, readonly MessageKey[]> = {
  // v3.0 M1：分层台词（首次见面 / 深夜 / 久无互动 / 饿了）
  'first-meet': [
    'emotion.firstMeet.line0',
    'emotion.firstMeet.line1',
    'emotion.firstMeet.line2',
  ],
  'head-tap': [
    'emotion.touch.blush0',
    'emotion.touch.blush1',
    'emotion.touch.blush2',
    'emotion.touch.blush3',
    'emotion.touch.blush4',
    'emotion.touch.blush5',
  ],
  'head-longpress': [
    'emotion.touch.protect0',
    'emotion.touch.protect1',
    'emotion.touch.protect2',
    'emotion.touch.protect3',
  ],
  'body-tap': [
    'emotion.touch.body0',
    'emotion.touch.body1',
    'emotion.touch.body2',
    'emotion.touch.body3',
  ],
  'body-longpress': [
    'emotion.touch.longpress0',
    'emotion.touch.longpress1',
    'emotion.touch.longpress2',
  ],
  'body-double': [
    'emotion.touch.double0',
    'emotion.touch.double1',
    'emotion.touch.double2',
  ],
  raised: ['emotion.touch.protect2', 'emotion.touch.protect3', 'emotion.touch.protect4', 'emotion.touch.blush5'],
  cheer: ['emotion.touch.cheer0', 'emotion.touch.cheer1', 'emotion.touch.cheer2'],
  ambient: [
    'emotion.ambient.line0',
    'emotion.ambient.line1',
    'emotion.ambient.line2',
    'emotion.ambient.line3',
    'emotion.ambient.line4',
    'emotion.ambient.line5',
    'emotion.ambient.line6',
    'emotion.ambient.line7',
  ],
  // v3.0 M1：晚间/久无互动/饿了（饿了由 M2 的饥饿度消费者接入）
  'late-night': [
    'emotion.lateNight.line0',
    'emotion.lateNight.line1',
    'emotion.lateNight.line2',
  ],
  'idle-long': [
    'emotion.idleLong.line0',
    'emotion.idleLong.line1',
    'emotion.idleLong.line2',
  ],
  hungry: ['emotion.hungry.line0', 'emotion.hungry.line1', 'emotion.hungry.line2'],
  // P3 日常三场戏（台词在 i18n `emotion.eatRice/workRest/calledFat`）
  'eat-rice': ['emotion.eatRice.line0', 'emotion.eatRice.line1', 'emotion.eatRice.line2'],
  'work-rest': ['emotion.workRest.line0', 'emotion.workRest.line1', 'emotion.workRest.line2'],
  'called-fat': ['emotion.calledFat.line0', 'emotion.calledFat.line1', 'emotion.calledFat.line2'],
};

/** 从池中随机取一条；random ∈ [0,1) */
export function pickPetLine(pool: PetLinePoolId, random = Math.random()): MessageKey {
  const keys = PET_LINE_POOLS[pool];
  const index = Math.min(keys.length - 1, Math.max(0, Math.floor(random * keys.length)));
  return keys[index] as MessageKey;
}
