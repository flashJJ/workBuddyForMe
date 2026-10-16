'use client';

import * as React from 'react';
import type { AwarenessEvent } from '@wbfm/shared/awareness';
import { useConversations } from '@/lib/hooks/use-conversations';
import {
  evaluateContextTick,
  isActiveNow,
  loadContextState,
  saveContextState,
} from './context-awareness';
import { readLastInteractionMinutes } from './event-activity';

/** tick 周期：与主动搭话同口径（Electron 后台节流下分钟级可达） */
const CONTEXT_TICK_MS = 60_000;

interface UseContextTriggersArgs {
  /** 事件总开关 + 有演出出口 + 有可用模型（决定 fire 是否入导演；状态仍照常归约防补演） */
  enabled: boolean;
  /** 系统事件授权开启（仅桌面桥存在时生效；否则回落应用内活动） */
  systemAware: boolean;
  triggerEvent: (eventId: string) => boolean;
}

/** 取全助手最后一条消息时间（ms）；无会话/无消息返回 null */
function latestChatAt(conversations: { lastMessageAt?: string | null }[] | undefined): number | null {
  let latest = 0;
  for (const c of conversations ?? []) {
    if (!c.lastMessageAt) continue;
    const t = Date.parse(c.lastMessageAt);
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  return latest > 0 ? latest : null;
}

/**
 * v2.0 M3 上下文触发器（仅 UI 会话）：
 * - 60s tick：连续工作/深夜/久未对话由 shared 状态机边沿判定，产出交 EventDirector
 *   （频率档/勿扰/总开关/出口/对话锁全部沿用既有闸门）；
 * - 系统事件（需显式授权）：lock/suspend 立即断工作段，unlock/resume 即时补评估，
 *   idle 样本更新系统空闲口径；未授权或纯浏览器只用应用内活动；
 * - 状态机任何时刻都照常归约（含总开关关闭期），避免重新开启后补演历史时刻；
 * - 原始信号不落盘：localStorage 仅存边沿去重状态。
 */
export function useContextTriggers({
  enabled,
  systemAware,
  triggerEvent,
}: UseContextTriggersArgs): void {
  const { data: conversations } = useConversations();
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;
  const systemAwareRef = React.useRef(systemAware);
  systemAwareRef.current = systemAware;
  const triggerRef = React.useRef(triggerEvent);
  triggerRef.current = triggerEvent;
  const lastChatRef = React.useRef<number | null>(null);
  lastChatRef.current = latestChatAt(conversations);

  const stateRef = React.useRef<ReturnType<typeof loadContextState> | null>(null);
  if (!stateRef.current) stateRef.current = loadContextState();
  const systemIdleRef = React.useRef<number | null>(null);

  const evaluate = React.useCallback((now: number, forceActive?: boolean) => {
    const appInteractionMin = readLastInteractionMinutes(now);
    const activeNow =
      forceActive ??
      isActiveNow({
        systemAware: systemAwareRef.current,
        systemIdleSeconds: systemIdleRef.current,
        appInteractionMin,
      });
    const result = evaluateContextTick({
      state: stateRef.current!,
      now,
      activeNow,
      lastChatAt: lastChatRef.current,
    });
    stateRef.current = result.state;
    saveContextState(result.state);
    if (enabledRef.current && forceActive !== false) {
      for (const fire of result.fires) triggerRef.current(fire.eventId);
    }
  }, []);

  // 周期 tick
  React.useEffect(() => {
    const timer = window.setInterval(() => evaluate(Date.now()), CONTEXT_TICK_MS);
    return () => window.clearInterval(timer);
  }, [evaluate]);

  // 桌面系统事件桥：授权 + 总开关双门控；变化即重新武装
  React.useEffect(() => {
    const bridge = window.wbfm?.awareness;
    if (!enabled || !systemAware || !bridge) return;
    void bridge.setEnabled(true);
    const off = bridge.onEvent((event: AwarenessEvent) => {
      switch (event.type) {
        case 'lock':
        case 'suspend':
          // 锁屏/睡眠：立即断工作段并落状态，唤醒后重新计 90 分钟
          systemIdleRef.current = null;
          evaluate(event.at, false);
          break;
        case 'unlock':
        case 'resume':
          systemIdleRef.current = 0;
          evaluate(event.at, true);
          break;
        case 'idle':
          systemIdleRef.current = event.idleSeconds;
          evaluate(event.at);
          break;
        default:
          break;
      }
    });
    return () => {
      off();
      systemIdleRef.current = null;
      void bridge.setEnabled(false);
    };
  }, [enabled, systemAware, evaluate]);
}
