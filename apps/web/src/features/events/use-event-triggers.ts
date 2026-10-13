'use client';

import * as React from 'react';
import { extractEmotionSignal } from '@wbfm/shared/schemas';
import { eventIdForIntent } from '@wbfm/shared/events';
import type { Message } from '@wbfm/shared/types';
import { CustomTriggerGate } from '@wbfm/core/event-client';
import { useReunionGreeting } from '@/features/avatar/use-reunion-greeting';
import { bumpInteractionCounter } from './daily-counter';
import { ACTIVITY_WRITE_THROTTLE_MS, markActivity } from './event-activity';
import { uiTaskEventBus } from './event-bus';
import { shanghaiDateKey } from './remote-usage-store';
import { useEventTriggers as useEventTriggersData } from './use-event-triggers-data';
import {
  REUNION_TIER_TO_NUMBER,
  resolveSoulEventIntent,
  resolveUserMessageIntents,
} from './trigger-rules';

interface UseEventTriggersArgs {
  messages: Message[];
  enabled: boolean;
  /** v1.6 久别迎接切净：需同时过情绪/短句两个既有开关 */
  reunionEnabled: boolean;
  /** M5：自定义短语触发器按当前助手拉取 */
  assistantId: string;
  /** 当前亲密度（自定义规则 minIntimacy 闸门用） */
  intimacy: number;
  triggerEvent: (eventId: string, extraCounters?: Record<string, number>) => boolean;
}

const INTENT_EXTRA: Partial<Record<string, Record<string, number>>> = {
  firstDailyInteraction: { interactionsToday: 0 },
};

/**
 * v1.7 内置触发源接线（M3，仅 UI 会话）：
 * - 用户消息：当日首条早安、深夜晚安、belittle 窗口内安慰；
 * - 助手终态消息：情绪协议 soulEvent=praise/belittle；
 * - 久别归来：复用 v1.6 判定/去重，出口改为事件（禁止双播）；
 * - 任务族：UI 事件总线（api/mcp/远端不经过）。
 */
export function useEventTriggers({
  messages,
  enabled,
  reunionEnabled,
  assistantId,
  intimacy,
  triggerEvent,
}: UseEventTriggersArgs): void {
  const triggerRef = React.useRef(triggerEvent);
  triggerRef.current = triggerEvent;
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;
  const intimacyRef = React.useRef(intimacy);
  intimacyRef.current = intimacy;
  const lastBelittleAtRef = React.useRef<number | null>(null);
  const seenMessagesRef = React.useRef<Set<string>>(new Set());
  const lastActivityWriteRef = React.useRef(0);

  // M5：自定义规则与规则粒度闸门（切助手即重置，规则不跨助手串）
  const { data: customTriggers } = useEventTriggersData(assistantId);
  const customTriggersRef = React.useRef(customTriggers);
  customTriggersRef.current = customTriggers;
  const customGateRef = React.useRef<CustomTriggerGate | null>(null);
  if (!customGateRef.current) {
    customGateRef.current = new CustomTriggerGate({ toDateKey: shanghaiDateKey });
  }
  const gateAssistantRef = React.useRef(assistantId);
  if (gateAssistantRef.current !== assistantId) {
    gateAssistantRef.current = assistantId;
    customGateRef.current.reset();
  }

  // 归来事件（主窗判定；桌宠窗仅发跨窗信号，见 pet-stage）
  useReunionGreeting({
    enabled: enabled && reunionEnabled,
    onGreet: ({ tier }) => {
      if (!enabledRef.current) return;
      triggerRef.current(eventIdForIntent('reunion')!, {
        reunionTier: REUNION_TIER_TO_NUMBER[tier],
      });
    },
  });

  // 离散活动（供 time.lastInteractionMin 条件；1s 节流）
  React.useEffect(() => {
    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivityWriteRef.current >= ACTIVITY_WRITE_THROTTLE_MS) {
        lastActivityWriteRef.current = now;
        markActivity(now);
      }
    };
    window.addEventListener('pointerdown', onActivity, true);
    window.addEventListener('keydown', onActivity, true);
    return () => {
      window.removeEventListener('pointerdown', onActivity, true);
      window.removeEventListener('keydown', onActivity, true);
    };
  }, []);

  // 任务终态总线（仅 UI 会话）
  React.useEffect(() => {
    if (!enabled) return;
    return uiTaskEventBus.subscribe((outcome) => {
      const intent = outcome === 'success' ? 'taskRunSuccess' : 'taskRunFailure';
      triggerRef.current(eventIdForIntent(intent)!);
    });
  }, [enabled]);

  // 消息流：用户意图 + 助手情绪信号
  React.useEffect(() => {
    for (const message of messages) {
      if (!message.id || seenMessagesRef.current.has(message.id)) continue;
      seenMessagesRef.current.add(message.id);
      if (!enabledRef.current) continue;
      const now = Date.now();

      if (message.role === 'user') {
        markActivity(now);
        const today = bumpInteractionCounter(now);
        const hour = new Date(now).getHours();
        const intents = resolveUserMessageIntents({
          text: message.content,
          hour,
          // 早安条件看的是「本条之前」的当日交互数
          interactionsTodayBefore: today.count - 1,
          lastBelittleAt: lastBelittleAtRef.current,
          now,
        });
        for (const intent of intents) {
          triggerRef.current(eventIdForIntent(intent)!, INTENT_EXTRA[intent]);
        }

        // M5：自定义短语规则（本地闸门：短语/亲密度/时段/冷却/每日上限；
        // 命中后仍交导演做剧本级三锁/冷却仲裁）
        const shanghaiHour = new Date(now + 8 * 3600_000).getUTCHours();
        for (const rule of customTriggersRef.current ?? []) {
          if (
            customGateRef.current?.admit(rule, {
              text: message.content,
              hour: shanghaiHour,
              intimacy: intimacyRef.current,
            })
          ) {
            triggerRef.current(rule.eventId);
          }
        }
      } else if (message.role === 'assistant' && message.status === 'completed') {
        const extracted = extractEmotionSignal(message.content);
        if (!extracted) continue;
        const soul = resolveSoulEventIntent(extracted.signal.soulEvent);
        if (soul === 'belittle') {
          lastBelittleAtRef.current = now;
        } else if (soul === 'praise') {
          triggerRef.current(eventIdForIntent('praise')!);
        }
      }
    }
  }, [messages]);

  // 切换会话：去重集合重置（id 本身不跨会话复用，但控制集合体积）
  const conversationId = messages[0]?.conversationId;
  React.useEffect(() => {
    seenMessagesRef.current = new Set();
  }, [conversationId]);
}
