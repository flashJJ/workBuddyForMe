import type {
  PetScriptDecisionReason,
  PetScriptDecisionWorkState,
} from '@wbfm/shared/schemas';

/** 一次决策的上下文快照（只采集一次，避免打分过程中状态漂移） */
export interface DecisionContext {
  /** 本地小时 0–23 */
  hour: number;
  /** 关系等级 0–3 */
  relationshipLevel: number;
  /** 情绪档位 good/normal/low */
  mood: string;
  /** 工作信号粗粒度状态 */
  work: PetScriptDecisionWorkState;
  /** 实际空闲分钟数（桌宠窗口内） */
  idleMinutes: number;
  /** 最近用过的道具（用于阶段 1 去重） */
  recentProps: readonly string[];
}

/** 参与打分的候选场景特征（阶段 1 不依赖 theme/tags） */
export interface DecisionCandidate {
  sceneId: string;
  /** 最后一个 beat 的 at，近似场景时长 */
  durationMs: number;
  beatCount: number;
  props: readonly string[];
  playedToday: boolean;
  /** 上次开演时间（epoch ms；未知为 null） */
  lastPlayedAt: number | null;
}

export interface RankedCandidate {
  candidate: DecisionCandidate;
  score: number;
  reasons: PetScriptDecisionReason[];
}
