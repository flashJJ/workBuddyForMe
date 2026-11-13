import type { BoneMask } from '../contracts';
import { maskIncludes } from '../mask';

/**
 * 帧区域与 claim 的共享定义。
 * 放在独立文件，避免 ledger（记录）与 plan（决议）互相 import 形成运行时环。
 */

export const BODY_REGIONS = ['spine', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];

export type FrameLayer = 'base' | 'motion' | 'overlay';
export type ClaimMode = 'override' | 'additive';

/** 优先级：同一区域高者接管；同优先级不同 owner = 冲突 */
export const FRAME_PRIORITY = { base: 0, idle: 5, motion: 10, accent: 12, script: 15, seat: 20, prop: 20, overlay: 30 } as const;

export interface RegionClaim {
  region: BodyRegion;
  /** 写者标识：base:clip / behavior:hug / idle:relax / overlay:gaze */
  owner: string;
  layer: FrameLayer;
  mode: ClaimMode;
  priority: number;
  weight: number;
  /** 姿势/动作/意图 id，便于回查 */
  intent?: string;
}

export interface RegionLedgerEntry {
  region: BodyRegion;
  /** 当前接管该区域的 claim；只有 additive 时为 null */
  winner: RegionClaim | null;
  /** 本帧全部 claim，按优先级降序 */
  claims: RegionClaim[];
  /** 与 winner 同优先级但不同 owner 的写者 */
  conflicts: string[];
}

export interface FrameLedgerSnapshot {
  frame: number;
  timeMs: number;
  regions: RegionLedgerEntry[];
  conflictCount: number;
}

export function regionsForMask(mask: BoneMask): BodyRegion[] {
  return BODY_REGIONS.filter((region) => maskIncludes(mask, region));
}
