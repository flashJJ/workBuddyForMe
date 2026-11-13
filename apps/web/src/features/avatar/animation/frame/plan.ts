import { BODY_REGIONS, type BodyRegion, type RegionClaim } from './regions';

/**
 * 帧计划决议：在写入前把每个区域的 claim 收敛成一个 winner。
 *
 * - 高优先级接管（base → motion → overlay 的正常分层）；
 * - 同优先级、不同 owner 的 override 视为冲突：winner 保留，其余进入 losers；
 * - additive 层（视线/呼吸等）不参与 winner，也不会被拒绝。
 */

export interface RegionPlan {
  region: BodyRegion;
  winner: RegionClaim | null;
  /** 按优先级降序的全部 claim */
  claims: RegionClaim[];
  /** 冲突参与者（含 winner），用于台账展示 */
  conflicts: string[];
  /** 冲突中落败的 owner，执行前会被拒绝 */
  losers: string[];
}

export interface PlanResult {
  regions: RegionPlan[];
  conflictCount: number;
}

export function resolveClaims(claims: readonly RegionClaim[]): PlanResult {
  const regions: RegionPlan[] = [];
  let conflictCount = 0;
  for (const region of BODY_REGIONS) {
    const regionClaims = claims
      .filter((claim) => claim.region === region)
      .sort((a, b) => b.priority - a.priority);
    const overrides = regionClaims.filter((claim) => claim.mode === 'override');
    const winner = overrides[0] ?? null;
    const losers: string[] = [];
    if (winner) {
      for (const other of overrides.slice(1)) {
        if (other.priority === winner.priority && other.owner !== winner.owner) {
          losers.push(other.owner);
        }
      }
    }
    const conflicts = losers.length > 0 && winner ? [winner.owner, ...losers] : [];
    if (conflicts.length > 0) conflictCount += 1;
    regions.push({ region, winner, claims: regionClaims, conflicts, losers });
  }
  return { regions, conflictCount };
}

export class FramePlan {
  private readonly winners = new Map<BodyRegion, string>();
  private readonly blocked = new Set<string>();

  constructor(result: PlanResult) {
    for (const entry of result.regions) {
      if (entry.winner) this.winners.set(entry.region, entry.winner.owner);
      for (const owner of entry.losers) this.blocked.add(`${owner}|${entry.region}`);
    }
  }

  winnerOf(region: BodyRegion): string | undefined {
    return this.winners.get(region);
  }

  /** 该 owner 在任一区域落败，就整体拒绝（避免只写一半手臂/腿） */
  allows(owner: string): boolean {
    for (const key of this.blocked) {
      if (key.startsWith(`${owner}|`)) return false;
    }
    return true;
  }

  allowsRegion(owner: string, region: BodyRegion): boolean {
    return !this.blocked.has(`${owner}|${region}`);
  }
}
