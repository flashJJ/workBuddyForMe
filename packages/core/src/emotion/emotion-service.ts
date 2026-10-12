/**
 * v1.6 情绪服务：repo 与纯函数内核的组合层。
 *
 * 读路径（view）惰性衰减但不落库；写路径（record/setNeed/reset）先把存量
 * 状态衰减到当前时刻再演算并 upsert，保证离线期间的情绪平复在下次互动时结算。
 */
import { createEmotionStateRepository } from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import {
  applyEmotionEvent,
  createEmotionEvent,
  decayEmotionState,
  normalizeEmotionState,
} from './emotion-kernel';
import {
  createDefaultEmotionState,
  type EmotionNeed,
  type EmotionState,
  type EmotionEventSource,
  type SoulEventType,
} from '@wbfm/shared/schemas';

export interface RecordEmotionInput {
  type: SoulEventType;
  source: EmotionEventSource;
  description?: string;
}

export interface EmotionService {
  /** 读侧当前状态（已衰减）；无行返回默认状态，不写库 */
  view(assistantId: string, now?: number): EmotionState;
  /** 施加一个情绪事件并持久化，返回最新状态 */
  record(assistantId: string, input: RecordEmotionInput, now?: number): EmotionState;
  /** 显式设置当前需求（剧情/手动），持久化 */
  setNeed(assistantId: string, need: EmotionNeed, now?: number): EmotionState;
  /** 清除该助手的全部情绪/关系数据，返回默认状态 */
  reset(assistantId: string, now?: number): EmotionState;
}

export function createEmotionService({ db }: ServiceDeps): EmotionService {
  const repo = createEmotionStateRepository(db);

  const view = (assistantId: string, now = Date.now()): EmotionState => {
    const record = repo.get(assistantId);
    if (!record) return createDefaultEmotionState(now);
    const stored = normalizeEmotionState(record.state, now);
    return decayEmotionState(stored, now - stored.updatedAt, now);
  };

  const persist = (assistantId: string, next: EmotionState): EmotionState => {
    repo.upsert(assistantId, next);
    return next;
  };

  const record = (
    assistantId: string,
    input: RecordEmotionInput,
    now = Date.now(),
  ): EmotionState => {
    const current = view(assistantId, now);
    const next = applyEmotionEvent(current, createEmotionEvent({ ...input, timestamp: now }));
    return persist(assistantId, next);
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
    repo.delete(assistantId);
    return createDefaultEmotionState(now);
  };

  return { view, record, setNeed, reset };
}
