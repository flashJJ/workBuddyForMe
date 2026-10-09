'use client';

import * as React from 'react';
import type { SsePayloadMap } from '@wbfm/shared/api';
import type { VoiceSettings } from '@wbfm/shared/schemas';
import { API } from '@/lib/api/endpoints';
import { withManagedHeaders } from '@/lib/api/client';
import { SseReader } from '@/lib/api/sse-reader';
import type { VoiceAudioFrame } from '@/features/voice/audio-playback-queue';

/** 主动气泡：skip-history 轮的临时内容，不进消息列表、不持久化 */
export interface ProactiveBubble {
  messageId: string;
  content: string;
  status: 'streaming' | 'completed' | 'error';
}

interface UseProactiveChatArgs {
  assistantId: string;
  conversationId: string | null;
  voiceSettings: VoiceSettings | null | undefined;
  /** TTS 模型是否就绪（未就绪时静默降级为纯文字气泡） */
  ttsReady: boolean;
  /** 形象栏或桌宠任一可用（主动气泡的呈现出口） */
  hasVisualOutlet: boolean;
  /** 已配置可用对话模型 */
  hasChatModel: boolean;
  /** 正常对话轮次或语音播放进行中（主动轮绝不与之并发） */
  busy: boolean;
  /** 语音帧出口（入播放队列 + 桌宠中继），与正常对话同一路径 */
  onAudio: (frame: VoiceAudioFrame) => void;
  /** 中断主动轮时同步停掉未播完的 TTS */
  onCancelPlayback: () => void;
}

interface UseProactiveChatResult {
  bubble: ProactiveBubble | null;
  /** 主动轮是否进行中（用于气泡 loading 样式/调试） */
  active: boolean;
  dismiss: () => void;
}

/** 空闲检查周期：10s；Electron 后台节流下也能在分钟级触发（阈值本身是百秒级） */
const CHECK_INTERVAL_MS = 10_000;
/** 活动事件写时间戳的最小间隔（避免连续 mousemove 级事件刷屏，这里只听离散事件） */
const ACTIVITY_THROTTLE_MS = 1_000;

/**
 * F8 主动说话：
 * - 仅 proactiveEnabled 且有视觉出口（形象栏/桌宠）时武装；
 * - 用户离散操作（按键/点击/滚动）与正常对话轮次重置空闲计时；
 * - 到阈值且全局空闲时发起一次 skip-history 轻量轮，单飞、不并发；
 * - 轮次完成后冷却一个完整阈值周期；用户开始新对话立即中止主动轮。
 */
export function useProactiveChat(args: UseProactiveChatArgs): UseProactiveChatResult {
  const { assistantId, conversationId, voiceSettings, ttsReady, hasVisualOutlet, hasChatModel } =
    args;
  const [bubble, setBubble] = React.useState<ProactiveBubble | null>(null);
  const [active, setActive] = React.useState(false);

  const lastActivityRef = React.useRef(Date.now());
  const inFlightRef = React.useRef(false);
  const controllerRef = React.useRef<AbortController | null>(null);
  // 最新参数供 interval/事件闭包读取，避免重建监听器
  const argsRef = React.useRef(args);
  argsRef.current = args;

  const abortActive = React.useCallback(
    (silent: boolean) => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      inFlightRef.current = false;
      setActive(false);
      argsRef.current.onCancelPlayback();
      if (silent) setBubble(null);
      else setBubble((prev) => (prev && prev.status === 'streaming' ? null : prev));
    },
    [],
  );

  const dismiss = React.useCallback(() => {
    abortActive(true);
    lastActivityRef.current = Date.now();
  }, [abortActive]);

  // 武装条件（与计时器一致）：仅此时挂全局活动监听，日常浏览零开销
  const armed =
    Boolean(voiceSettings?.proactiveEnabled) && hasVisualOutlet && hasChatModel && Boolean(assistantId);

  // 全局离散活动：重置计时；活动期间收起已完成的主动气泡
  React.useEffect(() => {
    if (!armed) return;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return;
      lastActivityRef.current = now;
      setBubble((prev) => (prev && prev.status !== 'streaming' ? null : prev));
    };
    window.addEventListener('pointerdown', onActivity, true);
    window.addEventListener('keydown', onActivity, true);
    window.addEventListener('wheel', onActivity, true);
    return () => {
      window.removeEventListener('pointerdown', onActivity, true);
      window.removeEventListener('keydown', onActivity, true);
      window.removeEventListener('wheel', onActivity, true);
    };
  }, [armed]);

  // 正常轮次开始/语音播放占用：立即中止主动轮；轮次起止都刷新空闲计时
  React.useEffect(() => {
    lastActivityRef.current = Date.now();
    if (args.busy) abortActive(true);
  }, [args.busy, abortActive]);

  // 卸载清理
  React.useEffect(() => () => controllerRef.current?.abort(), []);

  const trigger = React.useCallback(async () => {
    const a = argsRef.current;
    if (
      inFlightRef.current ||
      a.busy ||
      !a.hasChatModel ||
      !a.hasVisualOutlet ||
      !a.voiceSettings?.proactiveEnabled
    ) {
      return;
    }
    inFlightRef.current = true;
    setActive(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    // holder 对象：属性访问不参与 TS 控制流窄化（let 在嵌套回调里被赋值会被误窄化为 null）
    const holder: { bubble: ProactiveBubble | null } = { bubble: null };

    const finish = (status: ProactiveBubble['status']) => {
      inFlightRef.current = false;
      setActive(false);
      controllerRef.current = null;
      if (status === 'error') {
        // 主动搭话失败不打扰用户：静默收起
        setBubble(null);
      } else if (holder.bubble) {
        holder.bubble = { ...holder.bubble, status };
        setBubble(holder.bubble);
      }
    };

    try {
      const useTts = Boolean(a.voiceSettings.ttsEnabled && a.ttsReady);
      const response = await fetch(
        API.chatProactive,
        withManagedHeaders({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            assistantId: a.assistantId,
            ...(a.conversationId ? { conversationId: a.conversationId } : {}),
            ...(useTts ? { voice: { tts: true } } : {}),
          }),
          signal: controller.signal,
        }),
      );
      if (!response.ok || !response.body) {
        finish('error');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SseReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const event of parser.feed(decoder.decode(value, { stream: true }))) {
          switch (event.event) {
            case 'meta': {
              const data = event.data as SsePayloadMap['meta'];
              holder.bubble = { messageId: data.messageId, content: '', status: 'streaming' };
              setBubble(holder.bubble);
              break;
            }
            case 'delta': {
              const data = event.data as SsePayloadMap['delta'];
              if (holder.bubble) {
                holder.bubble = {
                  ...holder.bubble,
                  content: holder.bubble.content + data.content,
                };
                setBubble(holder.bubble);
              }
              break;
            }
            case 'voice_audio':
              a.onAudio(event.data as VoiceAudioFrame);
              break;
            case 'done':
              finish('completed');
              break;
            case 'error':
              finish('error');
              break;
            default:
              break;
          }
        }
      }
      if (inFlightRef.current) finish('completed');
    } catch {
      // 主动 abort 或网络问题均静默（abort 由调用方负责 UI 清理）
      if (controller.signal.aborted) {
        inFlightRef.current = false;
        setActive(false);
      } else {
        finish('error');
      }
    }
  }, []);

  // 空闲计时器
  React.useEffect(() => {
    if (!armed) return;
    lastActivityRef.current = Date.now();
    const timer = window.setInterval(() => {
      if (argsRef.current.busy || inFlightRef.current) return;
      const idleMs = (voiceSettings?.proactiveIdleSeconds ?? 300) * 1000;
      if (Date.now() - lastActivityRef.current >= idleMs) {
        lastActivityRef.current = Date.now();
        void trigger();
      }
    }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [armed, voiceSettings?.proactiveIdleSeconds, trigger]);

  // 助手/会话切换：收起旧气泡并重新计时
  React.useEffect(() => {
    abortActive(true);
    lastActivityRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantId, conversationId]);

  return { bubble, active, dismiss };
}
