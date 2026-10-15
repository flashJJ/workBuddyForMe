/**
 * v1.6 情绪服务：repo 与纯函数内核的组合层。
 *
 * 读路径（view）惰性衰减但不落库；写路径（record/setNeed/reset）先把存量
 * 状态衰减到当前时刻再演算并 upsert，保证离线期间的情绪平复在下次互动时结算。
 * 每次 record 同时向 emotion_events 追加一条不可变流水（无对话原文）。
 *
 * v2.0：record 在情绪演算之后串联关系等级演算（日上限截断、升级抬地板），
 * 等级变迁写 source='system' 的 level_up/down 流水；每日检查点由 v1.7
 * scheduler 心跳驱动 runRelationshipCheckpoint，进程内按本地日去重，
 * relationshipEnabled=false 时全部冻结（intimacy/trust 原始分仍照走）。
 */
import {
  createEmotionStateRepository,
  createEmotionEventRepository,
  createRelationshipMilestoneRepository,
  type EmotionEventRecord,
} from '@wbfm/database';
import { EMOTION_EVENT_DELTAS } from '@wbfm/shared/constants';
import type { ServiceDeps } from '../services/deps';
import { createSettingsService } from '../services/settings-service';
import {
  applyEmotionEvent,
  createEmotionEvent,
  decayEmotionState,
} from './emotion-kernel';
import {
  applyRelationshipEvent,
  evaluateFloorAtCheckpoint,
} from './relationship-kernel';
import {
  createDefaultEmotionState,
  localDayKey,
  type EmotionNeed,
  type EmotionState,
  type EmotionEventSource,
  type ExpressionTag,
  type RelationshipLevelEvent,
  type SoulEventType,
} from '@wbfm/shared/schemas';

export interface RecordEmotionInput {
  type: SoulEventType;
  source: EmotionEventSource;
  description?: string;
  /** 本轮表情标签（对话回合带；手动/剧情事件可空） */
  emotion?: ExpressionTag | null;
  /** 本轮情绪强度 0..1（可空） */
  intensity?: number | null;
  /** 触发该事件的助手消息 id（对话回合带；可空，消息删除置空） */
  messageId?: string | null;
}

export interface EmotionView {
  state: EmotionState;
  /** 近期事件流水（按时间倒序） */
  events: EmotionEventRecord[];
}

export interface EmotionService {
  /** 读侧当前状态（已衰减）；无行返回默认状态，不写库 */
  view(assistantId: string, now?: number): EmotionState;
  /** 状态 + 近期事件（面板用） */
  viewWithEvents(assistantId: string, eventLimit?: number, now?: number): EmotionView;
  /** 施加一个情绪事件：更新快照状态并追加流水，返回最新状态 */
  record(assistantId: string, input: RecordEmotionInput, now?: number): EmotionState;
  /** 显式设置当前需求（剧情/手动），持久化 */
  setNeed(assistantId: string, need: EmotionNeed, now?: number): EmotionState;
  /** 清除该助手的全部情绪/关系数据与事件流水，返回默认状态 */
  reset(assistantId: string, now?: number): EmotionState;
  /**
   * v2.0 每日关系检查点（scheduler 心跳驱动）：
   * 评估全部助手的地板降档；进程内按本地自然日去重，开关关闭时空转。
   */
  runRelationshipCheckpoint(now?: number): void;
}

function createSystemEventId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `relation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createEmotionService(deps: ServiceDeps): EmotionService {
  const { db } = deps;
  const stateRepo = createEmotionStateRepository(db);
  const eventRepo = createEmotionEventRepository(db);
  // v2.0 M2：「重新认识」语义——重置情绪/关系时共同里程碑一并清空（05 §4）
  const milestoneRepo = createRelationshipMilestoneRepository(db);
  const settings = createSettingsService(deps);
  /** 进程内检查点去重（重启后重跑由 kernel 当日幂等兜底） */
  let checkpointDay: string | null = null;

  const view = (assistantId: string, now = Date.now()): EmotionState => {
    const record = stateRepo.get(assistantId);
    if (!record) return createDefaultEmotionState(now);
    // decay 内部对存量状态做归一化（坏数据回落），updatedAt=0 也安全
    return decayEmotionState(record.state, now - record.state.updatedAt, now);
  };

  const persist = (assistantId: string, next: EmotionState): EmotionState => {
    stateRepo.upsert(assistantId, next);
    return next;
  };

  /** 等级变迁落 system 流水（任何失败只告警，不影响已完成的状态演算） */
  const addLevelEvents = (
    assistantId: string,
    levelEvents: RelationshipLevelEvent[],
    now: number,
  ): void => {
    for (const levelEvent of levelEvents) {
      try {
        eventRepo.add(assistantId, {
          id: createSystemEventId(),
          type: levelEvent.type,
          source: 'system',
          emotion: null,
          intensity: levelEvent.to,
          messageId: null,
          timestampMs: now,
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          `[wbfm] 等级事件流水写入失败（不影响状态）：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  };

  const record = (
    assistantId: string,
    input: RecordEmotionInput,
    now = Date.now(),
  ): EmotionState => {
    const current = view(assistantId, now);
    const event = createEmotionEvent({
      type: input.type,
      source: input.source,
      timestamp: now,
      ...(input.description ? { description: input.description } : {}),
    });
    const next = applyEmotionEvent(current, event);

    // v2.0：关系等级演算（日上限截断 + 实时升级抬地板）。
    // 关闭时冻结关系块，intimacy/trust 沿用 v1.6 未截断结果。
    if (settings.get().relationshipEnabled !== false) {
      const delta = EMOTION_EVENT_DELTAS[input.type];
      const relationResult = applyRelationshipEvent(
        current.relationship,
        current.relation,
        { intimacy: delta.intimacy, trust: delta.trust },
        localDayKey(now),
      );
      next.relation = relationResult.relation;
      next.relationship = relationResult.block;
      addLevelEvents(assistantId, relationResult.events, now);
    }

    persist(assistantId, next);
    // 流水独立于快照：记录本轮表情/强度与消息外键（任何失败不影响已完成的状态）
    try {
      eventRepo.add(assistantId, {
        id: event.id,
        type: event.type,
        source: event.source,
        emotion: input.emotion ?? null,
        intensity: input.intensity ?? null,
        messageId: input.messageId ?? null,
        timestampMs: now,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `[wbfm] 情绪事件流水写入失败（不影响状态）：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return next;
  };

  const setNeed = (
    assistantId: string,
    need: EmotionNeed,
    now = Date.now(),
  ): EmotionState => {
    const current = view(assistantId, now);
    return persist(assistantId, { ...current, currentNeed: need, updatedAt: now });
  };

  const reset = (assistantId: string, now = Date.now()): EmotionState => {
    eventRepo.deleteByAssistant(assistantId);
    milestoneRepo.deleteByAssistant(assistantId);
    stateRepo.delete(assistantId);
    return createDefaultEmotionState(now);
  };

  const runRelationshipCheckpoint = (now = Date.now()): void => {
    // 开关关闭：地板冻结，不评估
    if (settings.get().relationshipEnabled === false) return;
    const dayKey = localDayKey(now);
    if (checkpointDay === dayKey) return;
    checkpointDay = dayKey;
    for (const row of stateRepo.list()) {
      try {
        const { block, event: levelEvent } = evaluateFloorAtCheckpoint(
          row.state.relationship,
          dayKey,
        );
        if (!levelEvent) continue;
        // 只换关系块；updatedAt 不动（检查点不是互动，不能重置 mood 衰减基线）
        stateRepo.upsert(row.assistantId, { ...row.state, relationship: block });
        addLevelEvents(row.assistantId, [levelEvent], now);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          `[wbfm] 关系检查点处理失败（助手 ${row.assistantId}）：${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  };

  return {
    view,
    viewWithEvents(assistantId, eventLimit = 10, now = Date.now()): EmotionView {
      return { state: view(assistantId, now), events: eventRepo.listByAssistant(assistantId, eventLimit) };
    },
    record,
    setNeed,
    reset,
    runRelationshipCheckpoint,
  };
}
