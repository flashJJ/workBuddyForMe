import {
  PET_SCRIPT_GENERATION_LIMITS,
  type PetScriptGenerationUsage,
  type Scene,
} from '@wbfm/shared/schemas';

/** settings_kv 键：日期、调用/估算 token、已入队场景 */
export const PET_SCRIPT_GENERATION_KEY = 'pet-script.generation';

export interface PetScriptGenerationState {
  /** YYYY-MM-DD（本地时区） */
  date: string;
  calls: number;
  tokens: number;
  /** 最新在前 */
  scenes: Scene[];
}

/** 生成器持久化抽象：生产走 settings_kv，单测用内存实现 */
export interface PetScriptGenerationStore {
  load(): unknown;
  save(state: PetScriptGenerationState): void;
}

export function localDateKey(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function nonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** 跨天自动清零；坏数据回落空状态 */
export function resolveState(raw: unknown, date: string): PetScriptGenerationState {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!value || value.date !== date) return { date, calls: 0, tokens: 0, scenes: [] };
  return {
    date,
    calls: nonNegative(value.calls),
    tokens: nonNegative(value.tokens),
    scenes: Array.isArray(value.scenes) ? (value.scenes as Scene[]) : [],
  };
}

export function resolveUsage(state: PetScriptGenerationState): PetScriptGenerationUsage {
  return {
    date: state.date,
    calls: state.calls,
    tokens: state.tokens,
    callLimit: PET_SCRIPT_GENERATION_LIMITS.dailyCalls,
    tokenLimit: PET_SCRIPT_GENERATION_LIMITS.dailyTokens,
  };
}

export function hasCapacity(usage: PetScriptGenerationUsage): boolean {
  return usage.calls < usage.callLimit && usage.tokens < usage.tokenLimit;
}

/** 粗估 token：中英文混排按 2 字符 ≈ 1 token，仅用于每日预算闸门 */
export function estimateTokens(...texts: string[]): number {
  const chars = texts.reduce((sum, text) => sum + text.length, 0);
  return Math.ceil(chars / 2);
}

/** 新场景入队：同 id 更新并置顶，超出上限裁掉最旧 */
export function enqueueScene(scenes: readonly Scene[], scene: Scene): Scene[] {
  const next = [scene, ...scenes.filter((item) => item.id !== scene.id)];
  return next.slice(0, PET_SCRIPT_GENERATION_LIMITS.maxQueue);
}
