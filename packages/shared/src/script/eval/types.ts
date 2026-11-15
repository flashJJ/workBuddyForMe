import type { MotionMood } from '../../schemas/media/motion-asset';
import type {
  PetScriptDecisionReason,
  PetScriptDecisionReasonCode,
  PetScriptDecisionWorkState,
} from '../../schemas/script/decision';

/** v4.1 评测：固定上下文（时段 × 工作 × 关系 × 心情） */
export interface CompanionEvalContext {
  id: string;
  label: string;
  /** 本地小时 0–23 */
  hour: number;
  idleMinutes: number;
  relationshipLevel: number;
  mood: string;
  work: PetScriptDecisionWorkState;
  recentProps?: readonly string[];
  recentThemes?: readonly string[];
  usedTags?: readonly string[];
}

/** 候选快照：来自生成队列或 fixtures，不含聊天正文 */
export interface CompanionCandidateSnapshot {
  sceneId: string;
  title?: string;
  durationMs: number;
  beatCount?: number;
  props?: readonly string[];
  playedToday?: boolean;
  lastPlayedAt?: number | null;
  theme?: string;
  tags?: readonly string[];
  preferredMoods?: readonly MotionMood[];
  preferredHours?: readonly { from: number; to: number }[];
}

export interface CompanionMatrixRank {
  sceneId: string;
  score: number;
  reasons: PetScriptDecisionReason[];
}

export interface CompanionMatrixRow {
  contextId: string;
  label: string;
  ranked: CompanionMatrixRank[];
}

export interface CompanionRankDiff {
  contextId: string;
  sceneId: string;
  /** 1 起；新进入为 null */
  fromRank: number | null;
  /** 1 起；掉出为 null */
  toRank: number | null;
}

export interface CompanionReplayRow {
  at: number;
  sceneId: string;
  recordedScore: number;
  recomputedScore: number | null;
  delta: number | null;
  missing: boolean;
}

export interface CompanionReplaySummary {
  rows: CompanionReplayRow[];
  total: number;
  replayable: number;
  missing: number;
  meanAbsDelta: number | null;
  maxAbsDelta: number | null;
}

export interface QualityGateSnapshot {
  perDay: number;
  playsToday: number;
  budgetRemaining: number;
  unplayedScenes: number;
  quietHoursActive: boolean;
}

export interface CompanionQualityReport {
  /** 统计窗口（读取的决策条数上限） */
  window: number;
  count: number;
  repeats: number;
  repeatRate: number;
  dedupeHits: number;
  dedupeRate: number;
  freshHits: number;
  freshRate: number;
  prefHits: number;
  prefRate: number;
  longSceneHits: number;
  avgScore: number;
  topReasons: Array<{ code: PetScriptDecisionReasonCode; count: number }>;
  gate: QualityGateSnapshot;
}
