/**
 * M0d T2.4：视线目标解析（纯函数）。
 *
 * 优先级：睡眠 > 行为 look 轨道 > 常规指针 gaze / 背对静默；
 * 最后叠加睡眠低头与环境漂移，交给姿态层做平滑。
 */

import type { ScriptLookTarget } from '@wbfm/shared/schemas';
import { LOOK_DIRECTIONS } from '../animation/look';
import { gazeAngles, type GazeAngles } from '../performance/gaze';
import { ambientHeadAngles } from '../performance/gesture';

export const HEAD_IDLE_PITCH = 0.12;

export interface GazeTargetInput {
  t: number;
  /** 归一化指针（-1..1） */
  pointerX: number;
  pointerY: number;
  gazeWeight: number;
  /** 指针久未移动 */
  idle: boolean;
  /** 睡眠或背对：常规 gaze 与环境漂移静默 */
  muted: boolean;
  sleeping: boolean;
  /** 行为 look 轨道；null = 无 */
  look: ScriptLookTarget | null;
  lookWeight: number;
  /** 头部俯仰符号（VRM0 -1 / VRM1 +1） */
  pitchSign: number;
}

export function resolveGazeTarget(input: GazeTargetInput): GazeAngles {
  let x = input.idle ? 0 : input.pointerX;
  let y = input.idle ? 0 : input.pointerY;
  let weight = input.muted ? 0 : input.gazeWeight;
  if (input.look && !input.sleeping) {
    if (input.look !== 'pointer') [x, y] = LOOK_DIRECTIONS[input.look];
    weight = Math.max(weight, Math.min(1, input.lookWeight));
  }
  const target = gazeAngles(x, y, weight);
  if (input.sleeping) target.headPitch += HEAD_IDLE_PITCH;
  const ambient = input.muted ? { yaw: 0, pitch: 0 } : ambientHeadAngles(input.t);
  target.headYaw += ambient.yaw;
  target.headPitch = target.headPitch * input.pitchSign + ambient.pitch;
  return target;
}
