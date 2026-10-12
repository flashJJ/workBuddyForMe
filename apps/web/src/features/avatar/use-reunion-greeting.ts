'use client';

import * as React from 'react';
import {
  decideReunion,
  pickReunionLineKey,
  REUNION_TIER_EXPRESSION,
  type ReunionTier,
} from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { useConversations } from '@/lib/hooks/use-conversations';
import type { ExpressionTag } from './expression-parser';
import {
  onReunionSignal,
  readReunionMemory,
  writeReunionMemory,
} from './reunion-storage';

export interface ReunionGreeting {
  lineKey: MessageKey;
  expression: ExpressionTag;
  tier: ReunionTier;
}

interface UseReunionGreetingOptions {
  /** 情绪总开关 && 互动短句开关同时为真才允许迎接 */
  enabled: boolean;
  /** 命中久别时的表现回调（字幕气泡 + 表情闪现由调用方承接） */
  onGreet: (greeting: ReunionGreeting) => void;
  /** 注入随机数（测试用） */
  random?: () => number;
  now?: () => number;
}

/** 取全助手最后一条消息时间（ms）；无会话/无消息返回 null */
function latestInteractionAt(
  conversations: { lastMessageAt: string | null }[] | undefined,
): number | null {
  let latest = 0;
  for (const c of conversations ?? []) {
    if (!c.lastMessageAt) continue;
    const t = Date.parse(c.lastMessageAt);
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  return latest > 0 ? latest : null;
}

/**
 * v1.6 G6 久别迎接（桌宠窗）：零 LLM、零 IPC、零落库。
 *
 * 触发源：会话数据就绪后的首次判定、窗口重新聚焦、页面重新可见、
 * 主窗回前台（storage 信号）、以及调用方手动 poke（鼠标重新悬停桌宠）。
 * 每波久别全局只迎接一次（localStorage 去重，跨窗口生效）。
 */
export function useReunionGreeting(options: UseReunionGreetingOptions) {
  const optionsRef = React.useRef(options);
  optionsRef.current = options;
  const { data: conversations, isSuccess } = useConversations();

  const check = React.useCallback(() => {
    const opts = optionsRef.current;
    if (!opts.enabled) return;
    const now = opts.now?.() ?? Date.now();
    const lastInteractionAt = latestInteractionAt(conversations);
    const decision = decideReunion({
      lastInteractionAt,
      lastGreetedInteractionAt: readReunionMemory()?.greetedInteractionAt ?? null,
      now,
    });
    if (!decision.greet || !decision.tier) return;
    const tier = decision.tier;
    const random = opts.random?.() ?? Math.random();
    // 记录本次迎接针对的久别基线：用户产生新交互前不再重复迎接
    writeReunionMemory({ greetedInteractionAt: lastInteractionAt ?? now, greetedAt: now });
    opts.onGreet({
      lineKey: pickReunionLineKey(tier, random) as MessageKey,
      expression: REUNION_TIER_EXPRESSION[tier],
      tier,
    });
  }, [conversations]);

  // 会话数据首次就绪：判一次（应用/桌宠冷启动覆盖）
  React.useEffect(() => {
    if (options.enabled && isSuccess) check();
  }, [options.enabled, isSuccess, check]);

  React.useEffect(() => {
    if (!options.enabled) return;
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') check();
    };
    const onFocus = (): void => check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    const offSignal = onReunionSignal(() => check());
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      offSignal();
    };
  }, [options.enabled, check]);

  /** 鼠标重新进入桌宠命中区时由舞台层调用 */
  return React.useCallback(() => check(), [check]);
}
