/**
 * v2.0 关系报告契约类型（M5 / G4，见 docs/plan/v2.0/05 §5）。
 * 纯类型 + 冻结常量；聚合实现见 ./relationship-report。
 */
import type {
  EmotionEventView,
  EmotionState,
  EventRunOutcome,
  RelationshipLevelValue,
  RelationshipMilestoneRecord,
} from '@wbfm/shared/schemas';

export type ReportSectionKey =
  | 'overview'
  | 'assistants'
  | 'milestones'
  | 'disturbance'
  | 'series';

export const REPORT_SECTION_KEYS: readonly ReportSectionKey[] = [
  'overview',
  'assistants',
  'milestones',
  'disturbance',
  'series',
];

export const REPORT_DEFAULT_SERIES_DAYS = 30;

export interface ReportStateRow {
  assistantId: string;
  name?: string | null;
  state: EmotionState;
}

export interface ReportUsageRow {
  outcome: EventRunOutcome;
  reason: string | null;
  playedAt: string;
}

export interface RelationshipReportOptions {
  /** 从报告中整体抹除的助手（其事件/里程碑一并排除；即「记忆项可删」） */
  excludeAssistantIds?: readonly string[];
  /** 单条抹除的里程碑记录 id */
  excludeMilestoneIds?: readonly string[];
  /** 日桶窗口天数（默认 30） */
  seriesDays?: number;
}

export interface ReportAssistantRow {
  assistantId: string;
  name: string;
  level: RelationshipLevelValue;
  highestLevelEver: RelationshipLevelValue;
  intimacy: number;
  trust: number;
  lastPositiveDay: string | null;
  milestonesAchieved: number;
}

export interface ReportMilestoneRow {
  id: string;
  assistantId: string;
  assistantName: string;
  key: string;
  achievedAt: string;
  dayKey: string;
}

export interface ReportDisturbance {
  total: number;
  played: number;
  skipped: number;
  interrupted: number;
  suppressed: number;
  admitted: number;
  /** 0–1，total=0 时为 0 */
  suppressionRate: number;
  suppressByReason: Array<{ reason: string; count: number }>;
}

export interface ReportSeriesPoint {
  dayKey: string;
  praise: number;
  chat: number;
  belittle: number;
  comfort: number;
  levelUp: number;
  levelDown: number;
  total: number;
}

export interface RelationshipReportData {
  generatedAt: string;
  seriesDays: number;
  overview: {
    assistantCount: number;
    currentStreakDays: number;
    totalActiveDays: number;
    firstActiveDay: string | null;
    levelDistribution: [number, number, number, number];
    /** 索引 1/2/3：曾升到该等级的去重助手数（升 3 含 1、2） */
    unlockReach: [number, number, number];
    /** 相邻升级间隔中位数（天，1 位小数）；样本不足为 null */
    upgradeMedianDays: number | null;
  };
  assistants: ReportAssistantRow[];
  milestones: ReportMilestoneRow[];
  disturbance: ReportDisturbance;
  series: ReportSeriesPoint[];
}

export interface RelationshipReportInput {
  nowMs: number;
  states: ReportStateRow[];
  events: EmotionEventView[];
  milestones: RelationshipMilestoneRecord[];
  eventUsage: ReportUsageRow[];
  options?: RelationshipReportOptions;
}
