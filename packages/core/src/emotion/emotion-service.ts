/**
 * v1.6 情绪服务：repo 与纯函数内核的组合层。
 *
 * 读路径（view）惰性衰减但不落库；写路径（record/setNeed/reset）先把存量
 * 状态衰减到当前时刻再演算并 upsert，保证离线期间的情绪平复在下次互动时结算。
 * 每次 record 同时向 emotion_events 追加一条不可变流水（无对话原文）。
 */
import {
  createEmotionStateRepository,
  createEmotionEventRepository,
  type EmotionEventRecord,
} from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import {
  applyEmotionEvent,
  createEmotionEvent,
  decayEmotionState,
} from './emotion-kernel';
import {
  createDefaultEmotionState,
  type EmotionNeed,
  type EmotionState,
  type EmotionEventSource,
  type ExpressionTag,
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
}

export function createEmotionService({ db }: ServiceDeps): EmotionService {
  const stateRepo = createEmotionStateRepository(db);
  const eventRepo = createEmotionEventRepository(db);

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
    stateRepo.delete(assistantId);
    return createDefaultEmotionState(now);
  };

  return {
    view,
    viewWithEvents(assistantId, eventLimit = 10, now = Date.now()): EmotionView {
      return { state: view(assistantId, now), events: eventRepo.listByAssistant(assistantId, eventLimit) };
    },
    record,
    setNeed,
    reset,
  };
}
