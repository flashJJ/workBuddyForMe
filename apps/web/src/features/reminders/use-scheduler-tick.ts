'use client';

import * as React from 'react';
import type { ScheduledTaskView } from '@wbfm/shared/schemas';
import { apiGet, apiPost } from '@/lib/api/client';
import { useAssistants } from '@/lib/hooks/use-assistants';

/** 与 proactive 心跳同粒度（M0 冻结：10s） */
const TICK_INTERVAL_MS = 10_000;

export interface SchedulerTickHandlers {
  /** 当前会话助手（同助手且出口可用时走现场演出） */
  currentAssistantId: string;
  hasOutlet: () => boolean;
  isConvLocked: () => boolean;
  /** 现场演出回调；返回 false 表示未演出（调用方改走系统通知兜底） */
  deliverReminder: (text: string) => Promise<boolean>;
}

/**
 * v1.7 角色化提醒 tick（web 会话存活期驱动；见 docs/plan/v1.7/03 §2 要点 5）。
 * 幂等口径与服务端一致：每条到期项先 POST /fire 标记（once 停用/循环推进），
 * 标记成功后再投递；投递失败不影响时刻推进（错过即跳过，不重复打扰）。
 */
export function useSchedulerTick(handlers: SchedulerTickHandlers): void {
  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;
  const { data: assistants } = useAssistants();
  const assistantsRef = React.useRef(assistants);
  assistantsRef.current = assistants;
  const runningRef = React.useRef(false);

  const tick = React.useCallback(async (): Promise<void> => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const due = await apiGet<ScheduledTaskView[]>('/api/schedules/due');
      for (const task of due) {
        try {
          await apiPost(`/api/schedules/${encodeURIComponent(task.id)}/fire`);
        } catch {
          // 已被其他标签页标记/行已删：跳过投递，不重试
          continue;
        }
        await deliverDueTask(task, handlersRef.current, assistantsRef.current);
      }
    } catch (error) {
      // 心跳永不抛出：网络抖动/服务未就绪时下一轮自然重试
      console.warn('[scheduler] tick 失败', error);
    } finally {
      runningRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    const timer = window.setInterval(() => void tick(), TICK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [tick]);
}

/** 单条到期投递：同助手+有出口→现场演出；否则系统通知兜底（导出供单测） */
export async function deliverDueTask(
  task: ScheduledTaskView,
  handlers: Pick<SchedulerTickHandlers, 'currentAssistantId' | 'hasOutlet' | 'isConvLocked' | 'deliverReminder'>,
  assistants: { id: string; name: string }[] | undefined,
): Promise<'performed' | 'notified' | 'dropped'> {
  if (
    task.assistantId === handlers.currentAssistantId &&
    handlers.hasOutlet() &&
    !handlers.isConvLocked()
  ) {
    const performed = await handlers.deliverReminder(task.text);
    if (performed) return 'performed';
  }

  const name = assistants?.find((a) => a.id === task.assistantId)?.name ?? 'WorkBuddyForMe';
  const bridge = typeof window !== 'undefined' ? window.wbfm?.notify : undefined;
  if (bridge) {
    await bridge.show({ title: name, body: task.text }).catch(() => undefined);
    return 'notified';
  }
  // 纯浏览器（非 Electron）且无演出出口：无兜底通道，只留控制台痕迹
  console.info('[scheduler] 提醒到点（无通知通道）', name, task.text);
  return 'dropped';
}
