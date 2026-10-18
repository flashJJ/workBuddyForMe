'use client';

import * as React from 'react';
import type { AwarenessEvent } from '@wbfm/shared/awareness';
import { WORK_STREAK_IDLE_GAP_MS } from '@wbfm/shared/events';
import type { PetVoiceState } from '@wbfm/shared/pet';
import type { SystemSignal } from '@wbfm/shared/schemas';
import { useSettings } from '@/lib/hooks/use-settings';
import { getPetBridge } from './pet-bridge';

/**
 * v2.3 P2-2：主窗 → 桌宠的**系统信号**中继（补齐 P2-2 之前缺失的信号源）。
 *
 * 两类来源：
 * - 语音状态边沿：idle → 非 idle 发 `voice-start`；非 idle → idle 发 `voice-end`；
 * - 系统事件感知（需显式授权，v2.0 M3 桥）：`lock` → `locked`，`unlock`/`resume` → `wake`，
 *   系统空闲**越阈上升沿**（进入「人不在」）→ `idle` 一次 —— 30s 轮询样本本身不转发，避免刷屏。
 *
 * 载荷只有归一化信号（不含窗口标题/屏幕内容），由桌宠侧 Resolver 按动画图配置决定是否表演。
 */
export function usePetSignalRelay(args: { active: boolean; voiceState: PetVoiceState }): void {
  const { active, voiceState } = args;
  const bridge = React.useMemo(() => getPetBridge(), []);
  const { data: settings } = useSettings();
  const systemAwarenessEnabled = settings?.systemEventAwarenessEnabled === true;
  const activeNow = Boolean(bridge && active);

  const relay = React.useCallback(
    (signal: SystemSignal) => {
      bridge?.relayPerformance({ kind: 'interaction', event: { kind: 'system', signal } });
    },
    [bridge],
  );

  // 语音状态边沿（inactive → 非 idle 起说，非 idle → idle 说完）
  const prevVoiceRef = React.useRef<PetVoiceState>('idle');
  React.useEffect(() => {
    const prev = prevVoiceRef.current;
    prevVoiceRef.current = voiceState;
    if (!activeNow || prev === voiceState) return;
    if (prev === 'idle') relay('voice-start');
    else if (voiceState === 'idle') relay('voice-end');
  }, [activeNow, relay, voiceState]);

  // 系统事件感知：仅显式授权后才可能有事件流（主进程 setEnabled(true) 也由事件系统负责）
  const awayRef = React.useRef(false);
  React.useEffect(() => {
    if (!activeNow || !systemAwarenessEnabled) return;
    const awareness = window.wbfm?.awareness;
    if (!awareness) return;
    awayRef.current = false;
    return awareness.onEvent((event: AwarenessEvent) => {
      switch (event.type) {
        case 'lock':
        case 'suspend':
          awayRef.current = true;
          // suspend（睡眠）没有对应信号，只更新「人不在」状态
          if (event.type === 'lock') relay('locked');
          break;
        case 'unlock':
        case 'resume':
          awayRef.current = false;
          relay('wake');
          break;
        case 'idle': {
          const away = event.idleSeconds * 1000 >= WORK_STREAK_IDLE_GAP_MS;
          if (away && !awayRef.current) relay('idle');
          awayRef.current = away;
          break;
        }
        default:
          break;
      }
    });
  }, [activeNow, relay, systemAwarenessEnabled]);
}
