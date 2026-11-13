import type { BoneMask } from '../contracts';
import { resolveClaims } from './plan';
import {
  BODY_REGIONS,
  FRAME_PRIORITY,
  regionsForMask,
  type BodyRegion,
  type ClaimMode,
  type FrameLayer,
  type FrameLedgerSnapshot,
  type RegionClaim,
  type RegionLedgerEntry,
} from './regions';

export { BODY_REGIONS, FRAME_PRIORITY, regionsForMask };
export type { BodyRegion, ClaimMode, FrameLayer, FrameLedgerSnapshot, RegionClaim, RegionLedgerEntry };

/**
 * 帧台账：记录每一帧「哪个子系统写了哪个身体区域」。
 *
 * 与 `FramePlan` 共用同一套 claim 决议：
 * - 台账负责记录与冲突告警；
 * - 帧计划负责在写入前拒绝同优先级落败写者。
 */

const EMPTY_SNAPSHOT: FrameLedgerSnapshot = { frame: 0, timeMs: 0, regions: [], conflictCount: 0 };

export class FrameLedger {
  private frame = 0;
  private claims: RegionClaim[] = [];
  private last: FrameLedgerSnapshot = EMPTY_SNAPSHOT;
  private readonly warned = new Set<string>();

  constructor(private readonly warnOnConflict = process.env.NODE_ENV !== 'production') {}

  begin(): void {
    this.frame += 1;
    this.claims.length = 0;
  }

  claim(claim: RegionClaim): void {
    if (claim.weight <= 0) return;
    this.claims.push(claim);
  }

  claimMask(mask: BoneMask, claim: Omit<RegionClaim, 'region'>): void {
    for (const region of regionsForMask(mask)) this.claim({ ...claim, region });
  }

  /** 当前 claims 的决议结果（写入前使用） */
  resolve() {
    return resolveClaims(this.claims);
  }

  finish(timeMs: number): FrameLedgerSnapshot {
    const result = this.resolve();
    for (const entry of result.regions) {
      if (entry.conflicts.length > 0) this.report(entry.region, entry.conflicts);
    }
    this.last = {
      frame: this.frame,
      timeMs,
      regions: result.regions.map(({ region, winner, claims, conflicts }) => ({
        region,
        winner,
        claims,
        conflicts,
      })),
      conflictCount: result.conflictCount,
    };
    return this.last;
  }

  get snapshot(): FrameLedgerSnapshot {
    return this.last;
  }

  private report(region: BodyRegion, owners: string[]): void {
    if (!this.warnOnConflict) return;
    const key = `${region}:${owners.join('|')}`;
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(`[motion] 区域写者冲突 ${region}: ${owners.join(' / ')}`);
  }
}
