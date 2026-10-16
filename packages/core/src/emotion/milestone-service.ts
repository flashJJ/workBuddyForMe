/**
 * v2.0 M2 共同里程碑服务：
 * - 评估只依据只读统计（emotion_events 最早正向互动 + agent_runs done 计数），
 *   不新埋执行链路；达成事实幂等落 relationship_milestones（唯一索引兜底）；
 * - 触发时机：①每日检查点全助手扫描（进程内按本地日去重，随 scheduler 心跳）；
 *   ②聊天页 GET 里程碑时按当前助手懒评估（协作次数当天变化能实时达成）；
 * - relationshipEnabled=false 时冻结评估（已达成记录仍可查询，面板在 UI 层隐藏）。
 */
import {
  createAssistantRepository,
  createRelationshipMilestoneRepository,
} from '@wbfm/database';
import {
  localDayKey,
  type RelationshipMilestoneRecord,
} from '@wbfm/shared/schemas';
import type { ServiceDeps } from '../services/deps';
import { createSettingsService } from '../services/settings-service';
import { evaluateMilestones, type MilestoneStats } from './milestone';

export interface MilestoneService {
  /** 列出助手全部达成记录（正序）；不触发评估 */
  list(assistantId: string): RelationshipMilestoneRecord[];
  /** 懒评估单个助手并返回【本次新达成】记录（聊天页轮询/纪念演出判定用） */
  evaluateAssistant(assistantId: string, now?: number): RelationshipMilestoneRecord[];
  /** 每日检查点：扫描全部助手（进程内按本地日去重）；返回新达成记录 */
  evaluateAll(now?: number): RelationshipMilestoneRecord[];
}

function statsOf(
  repo: ReturnType<typeof createRelationshipMilestoneRepository>,
  assistantId: string,
): MilestoneStats {
  const raw = repo.statsFor(assistantId);
  return {
    firstPositiveDayKey: raw.firstPositiveEventAt
      ? localDayKey(new Date(raw.firstPositiveEventAt).getTime())
      : null,
    collabDoneCount: raw.collabDoneCount,
  };
}

export function createMilestoneService(deps: ServiceDeps): MilestoneService {
  const settings = createSettingsService(deps);
  const repo = createRelationshipMilestoneRepository(deps.db);
  const assistants = createAssistantRepository(deps.db);
  /** 全助手扫描的进程内日守卫（重启后重跑由唯一索引幂等兜底） */
  let scannedDay: string | null = null;

  const evaluateAssistantInternal = (
    assistantId: string,
    now: number,
  ): RelationshipMilestoneRecord[] => {
    const existing = repo.findByAssistant(assistantId);
    const achieved = new Set(existing.map((m) => m.milestoneKey));
    const due = evaluateMilestones(statsOf(repo, assistantId), localDayKey(now), achieved);
    const achievedAt = new Date(now).toISOString();
    const created: RelationshipMilestoneRecord[] = [];
    for (const def of due) {
      const record = repo.achieve({
        assistantId,
        milestoneKey: def.key,
        achievedAt,
        payload: { sceneId: def.sceneId },
      });
      if (record) created.push(record);
    }
    return created;
  };

  return {
    list(assistantId) {
      return repo.findByAssistant(assistantId);
    },

    evaluateAssistant(assistantId, now = Date.now()) {
      if (settings.get().relationshipEnabled === false) return [];
      try {
        return evaluateAssistantInternal(assistantId, now);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          `[wbfm] 里程碑评估失败（助手 ${assistantId}）：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return [];
      }
    },

    evaluateAll(now = Date.now()) {
      if (settings.get().relationshipEnabled === false) return [];
      const dayKey = localDayKey(now);
      if (scannedDay === dayKey) return [];
      scannedDay = dayKey;
      const created: RelationshipMilestoneRecord[] = [];
      for (const assistant of assistants.list()) {
        try {
          created.push(...evaluateAssistantInternal(assistant.id, now));
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn(
            `[wbfm] 里程碑每日扫描失败（助手 ${assistant.id}）：${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      return created;
    },
  };
}
