/**
 * M0c 动效分层库 T1.1：核心契约（纯类型，禁止 import three）。
 *
 * 依赖方向：contracts ← math / mask / skeleton ← pose / motion / behavior ← composer ← adapters。
 * poses / motions / behaviors 只引用这里的类型与 id，不持有运行时状态。
 */

import type { ExpressionTag, ScriptLookTarget } from '@wbfm/shared/schemas';

/** 骨骼组：mask 的最小单位；左右分开，便于相位错开 */
export type BoneGroup =
  | 'root'
  | 'spine'
  | 'head'
  | 'leftArm'
  | 'rightArm'
  | 'leftLeg'
  | 'rightLeg'
  | 'face';

export interface BoneMask {
  include: BoneGroup[];
  exclude?: BoneGroup[];
}

/** 单骨骼相对绑定姿态的欧拉旋转（弧度） */
export interface BoneRotation {
  x?: number;
  y?: number;
  z?: number;
}

/** 姿态变体：同语义、细微差异的替代骨骼集，运行时按 hold 周期随机切换 */
export interface PoseVariant {
  bones: Partial<Record<string, BoneRotation>>;
}

/** L1 姿势：命名静态姿态，不含时间轴 */
export interface PoseDefinition {
  id: string;
  mask: BoneMask;
  /** 骨骼名 → 相对绑定姿态旋转；未列出的骨骼保持 base */
  bones: Partial<Record<string, BoneRotation>>;
  /** 可选变体簇：同一个姿势的自然差异样本（2 个以上才有意义） */
  variants?: readonly PoseVariant[];
  /** 默认 additive（叠加在 mixer 姿态之上）；false = 替换为 base + 偏移 */
  additive?: boolean;
}

export type EasingName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export interface MotionKey {
  /** 相对动作起点的毫秒 */
  at: number;
  pose: string;
  easing?: EasingName;
}

/** L2 动作：有时长的程序化片段（关键帧 + 曲线） */
export interface MotionDefinition {
  id: string;
  durationMs: number;
  loop?: boolean;
  keys: MotionKey[];
}

/** L3 行为：阶段化组合，不直接写骨骼 */
export interface BehaviorDefinition {
  id: string;
  /** 数值越小优先级越高；同级不抢占，进队列 */
  priority: 0 | 1 | 2 | 3;
  interrupt: 'all' | 'never';
  enter?: PhaseDefinition;
  loop?: PhaseDefinition;
  exit?: PhaseDefinition;
}

export interface PhaseDefinition {
  durationMs?: number;
  /** 本阶段权重淡入/淡出时间（毫秒）；缺省用 Runner 的 120ms */
  fadeMs?: number;
  tracks: TrackDefinition[];
}

export type TrackDefinition =
  | {
      kind: 'pose';
      mask: BoneMask;
      pose: string;
      weight?: number;
      fadeMs?: number;
      phaseOffset?: number;
    }
  | { kind: 'motion'; mask: BoneMask; motion: string; weight?: number; at?: number }
  | { kind: 'root'; motion: string }
  | { kind: 'expression'; tag: ExpressionTag; holdMs?: number }
  | { kind: 'look'; target: ScriptLookTarget; weight?: number }
  | {
      kind: 'morph';
      /** 语义通道 → 目标权重（0..1）；运行时会乘行为/轨道权重，多轨道同通道取最大 */
      channels: Readonly<Record<string, number>>;
      weight?: number;
    };

/** 四元数快照（字段与 three 的 Quaternion 一致，但不依赖 three） */
export interface BoneQuat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** root 轨道输出：场景整体位移/朝向偏移（不写骨骼） */
export interface RootOffset {
  /** 垂直位移（米） */
  y: number;
  /** 绕 Y 轴摆动（弧度） */
  yaw: number;
  /** 绕 Z 轴侧摆（弧度） */
  roll: number;
}
