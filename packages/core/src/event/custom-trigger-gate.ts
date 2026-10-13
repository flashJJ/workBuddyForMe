/**
 * v1.7 M5 自定义短语触发器的本地闸门（纯逻辑，浏览器/Node 通用）。
 *
 * 与导演闸门的分工：
 * - 本模块回答「这条用户消息是否命中某条自定义规则、规则自身的频率/时段/亲密度
 *   闸门是否放行」（规则粒度，按 triggerId 记忆）；
 * - 命中并放行后仍交 EventDirector 做剧本级三锁/冷却/队列仲裁。
 *
 * 计数只保活在内存（会话/标签页粒度）：重启或换标签页后规则计数重新起算，
 * 属于可接受的宽松（剧本级冷却另有 event_usage 持久化兜底，不会无限播）。
 */
import type { EventTriggerView } from '@wbfm/shared/schemas';

/** 短语匹配：lowercase+trim+包含（中文无大小写差异；不做正则） */
export function phraseIncludes(text: string, phrase: string): boolean {
  const haystack = text.toLowerCase();
  const needle = phrase.trim().toLowerCase();
  if (!needle) return false;
  return haystack.includes(needle);
}

/** 规则是否含命中本条消息的短语 */
export function matchTrigger(text: string, trigger: Pick<EventTriggerView, 'phrases'>): boolean {
  return trigger.phrases.some((phrase) => phraseIncludes(text, phrase));
}

/**
 * 有效时段判定（本地小时，24h 制）。
 * start===end 视为全天；start>end 为跨夜窗口（如 22→6：hour>=22 或 hour<6）。
 */
export function isWithinHourWindow(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return true;
  if (startHour < endHour) return hour >= startHour && hour <= endHour;
  return hour >= startHour || hour <= endHour;
}

/** 亲密度门槛（0..100） */
export function meetsIntimacy(intimacy: number, minIntimacy: number): boolean {
  return intimacy >= minIntimacy;
}

interface TriggerCounters {
  lastFiredAt: number;
  /** dateKey → 当日已放行次数 */
  byDate: Map<string, number>;
}

export interface CustomTriggerGateDeps {
  /** 本地日界（默认 UTC；web 注入 Asia/Shanghai +8 口径） */
  toDateKey?: (nowMs: number) => string;
  now?: () => number;
}

/**
 * 规则粒度闸门记忆体：admit() 通过才计数并返回 true。
 * 判定顺序：启用 → 短语 → 亲密度 → 时段 → 冷却 → 每日上限。
 */
export class CustomTriggerGate {
  private readonly counters = new Map<string, TriggerCounters>();
  private readonly toDateKey: (nowMs: number) => string;
  private readonly now: () => number;

  constructor(deps: CustomTriggerGateDeps = {}) {
    this.toDateKey = deps.toDateKey ?? ((ms) => new Date(ms).toISOString().slice(0, 10));
    this.now = deps.now ?? (() => Date.now());
  }

  /**
   * 评估一条规则；全部通过返回 true 并登记本次放行（冷却/当日计数立即生效）。
   * 不通过的原因仅供调试/单测，不抛错。
   */
  admit(
    trigger: EventTriggerView,
    input: { text: string; hour: number; intimacy: number },
  ): boolean {
    if (!trigger.enabled) return false;
    if (!matchTrigger(input.text, trigger)) return false;
    if (!meetsIntimacy(input.intimacy, trigger.minIntimacy)) return false;
    if (!isWithinHourWindow(input.hour, trigger.startHour, trigger.endHour)) return false;

    const now = this.now();
    const state = this.counters.get(trigger.id) ?? { lastFiredAt: 0, byDate: new Map() };
    if (now - state.lastFiredAt < trigger.cooldownMs) return false;
    const dateKey = this.toDateKey(now);
    const todayCount = state.byDate.get(dateKey) ?? 0;
    if (todayCount >= trigger.maxPerDay) return false;

    state.lastFiredAt = now;
    state.byDate.set(dateKey, todayCount + 1);
    this.counters.set(trigger.id, state);
    return true;
  }

  /** 单测/切换助手时清空 */
  reset(): void {
    this.counters.clear();
  }
}
