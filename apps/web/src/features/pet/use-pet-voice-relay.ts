'use client';

import * as React from 'react';
import {
  PET_SUBTITLE_MAX,
  stripExpressionDirectives,
  type Message,
  type PetVoiceState,
  type SsePayloadMap,
} from '@wbfm/shared';
import { DEFAULT_EXPRESSION, latestExpression, type ExpressionTag } from '@/features/avatar/expression-parser';
import { getPetBridge } from './pet-bridge';

/** 桌宠电平中继节流：约 30Hz（口型动画本身不需要更高频率） */
const LEVEL_THROTTLE_MS = 33;

/** 取表情：F8 主动轮进行时以主动气泡内容为准，否则取最后一条助手消息 */
function useLastAssistantExpression(messages: Message[], proactiveContent?: string | null): ExpressionTag {
  return React.useMemo(() => {
    if (proactiveContent) {
      const proactiveTag = latestExpression(proactiveContent);
      if (proactiveTag) return proactiveTag;
    }
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.role === 'assistant') return latestExpression(m.content) ?? DEFAULT_EXPRESSION;
    }
    return DEFAULT_EXPRESSION;
  }, [messages, proactiveContent]);
}

interface UsePetVoiceRelayArgs {
  /** 桌宠是否打开（主窗 onOpenChange 驱动） */
  active: boolean;
  voiceState: PetVoiceState;
  messages: Message[];
  conversationId: string | null;
  subscribeLevel: (sink: (level: number) => void) => () => void;
  /** F8：主动轮气泡文本（存在时表情优先跟随它） */
  proactiveContent?: string | null;
}

/**
 * 主窗 → 桌宠的语音表现中继（仅桌宠打开时活动）：
 * 电平（音频线程回调节流 30Hz）/ 状态 / 表情 / 切会话清空 / 朗读句字幕。
 * 主进程会再次净化载荷，这里保持源数据规范即可。
 */
export function usePetVoiceRelay({
  active,
  voiceState,
  messages,
  conversationId,
  subscribeLevel,
  proactiveContent = null,
}: UsePetVoiceRelayArgs): (frame: SsePayloadMap['voice_audio']) => void {
  const bridge = React.useMemo(() => getPetBridge(), []);
  const activeNow = Boolean(bridge && active);
  const expression = useLastAssistantExpression(messages, proactiveContent);

  // 电平：订阅音频渲染线程（隐藏窗口不暂停），按 33ms 节流转发
  React.useEffect(() => {
    if (!activeNow || !bridge) return;
    let lastEmit = 0;
    return subscribeLevel((level) => {
      const now = performance.now();
      if (now - lastEmit >= LEVEL_THROTTLE_MS) {
        lastEmit = now;
        bridge.relayPerformance({ kind: 'level', value: level });
      }
    });
  }, [activeNow, bridge, subscribeLevel]);

  React.useEffect(() => {
    if (activeNow && bridge) bridge.relayPerformance({ kind: 'state', state: voiceState });
  }, [activeNow, bridge, voiceState]);

  React.useEffect(() => {
    if (activeNow && bridge) bridge.relayPerformance({ kind: 'expression', tag: expression });
  }, [activeNow, bridge, expression]);

  // 激活或切换会话：通知桌宠清空字幕/表情，避免上一轮残留
  React.useEffect(() => {
    if (activeNow && bridge) bridge.relayPerformance({ kind: 'conversation' });
  }, [activeNow, bridge, conversationId]);

  return React.useCallback(
    (frame: SsePayloadMap['voice_audio']) => {
      if (!activeNow || !bridge) return;
      const text = stripExpressionDirectives(frame.fragment).trim();
      if (text) {
        bridge.relayPerformance({
          kind: 'subtitle',
          text: text.slice(0, PET_SUBTITLE_MAX),
        });
      }
    },
    [activeNow, bridge],
  );
}

/**
 * 订阅桌宠开关状态（主窗设置页/对话页用）。
 * 挂载时拉取当前值，之后跟随主进程广播；纯浏览器（无桥）恒为 false。
 */
export function usePetOpenState(): boolean {
  const bridge = React.useMemo(() => getPetBridge(), []);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!bridge) {
      setOpen(false);
      return;
    }
    let alive = true;
    void bridge
      .isOpen()
      .then((value) => {
        if (alive) setOpen(value);
      })
      .catch(() => undefined);
    const off = bridge.onOpenChange((value) => {
      if (alive) setOpen(value);
    });
    return () => {
      alive = false;
      off();
    };
  }, [bridge]);

  return Boolean(bridge && open);
}
