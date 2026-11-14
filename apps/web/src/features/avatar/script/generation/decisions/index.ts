import {
  PET_SCRIPT_DECISION_LIMITS,
  petScriptDecisionRecordSchema,
  type PetScriptDecisionRecord,
  type PetScriptDecisionReport,
} from '@wbfm/shared/schemas';

/**
 * M3 Utility：最近决策的持久化状态（settings_kv 单键）。
 *
 * 只保存实际开演的决策；坏记录逐条丢弃，超出上限淘汰最旧。
 * 标题由服务端按剧情日记补齐，缺省回退 sceneId。
 */

export const PET_SCRIPT_DECISIONS_KEY = 'pet-script.decisions';

export interface PetScriptDecisionsState {
  /** 新→旧 */
  items: PetScriptDecisionRecord[];
}

export interface PetScriptDecisionsStore {
  load(): unknown;
  save(state: PetScriptDecisionsState): void;
}

export function resolveDecisions(raw: unknown): PetScriptDecisionsState {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const list = Array.isArray(value?.items) ? value.items : [];
  const items = list
    .map((item) => petScriptDecisionRecordSchema.safeParse(item))
    .filter((result): result is { success: true; data: PetScriptDecisionRecord } => result.success)
    .map((result) => result.data)
    .sort((a, b) => b.at - a.at)
    .slice(0, PET_SCRIPT_DECISION_LIMITS.maxStored);
  return { items };
}

/** 记录一次实际开演；同场景同时间戳覆盖，避免重试产生重复行 */
export function appendDecision(
  state: PetScriptDecisionsState,
  record: PetScriptDecisionRecord,
): PetScriptDecisionsState {
  const rest = state.items.filter(
    (item) => !(item.at === record.at && item.sceneId === record.sceneId),
  );
  return {
    items: [record, ...rest].sort((a, b) => b.at - a.at).slice(0, PET_SCRIPT_DECISION_LIMITS.maxStored),
  };
}

/** 上报 → 持久化记录；标题为空时回退 sceneId */
export function toDecisionRecord(
  report: PetScriptDecisionReport,
  at: number,
  title: string,
): PetScriptDecisionRecord {
  return {
    at,
    sceneId: report.sceneId,
    title: (title.trim() || report.sceneId).slice(0, 120),
    source: report.source,
    score: report.score,
    reasons: report.reasons,
    context: report.context,
  };
}
