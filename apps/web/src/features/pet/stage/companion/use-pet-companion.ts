'use client';

import * as React from 'react';
import type { MessageKey } from '@wbfm/shared/i18n';
import type { PetQuickAction } from '@wbfm/shared/pet';
import { pickPetLine } from '@wbfm/shared/schemas';
import { useVoiceSettings } from '@/features/voice';
import { getPetBridge } from '../../pet-bridge';

/** 首次见面的本地标记（与主窗共享同源 localStorage） */
const FIRST_MEET_KEY = 'wbfm.pet.met';
const FIRST_MEET_DELAY_MS = 1200;

export interface PetCompanionArgs {
  /** 互动短句开关 */
  linesEnabled: boolean;
  /** 剧本导演：右键菜单的干饭/炸毛直接用内置场戏播放 */
  script: { playScene(sceneId: string): boolean };
  showLine(text: string, durationMs: number): void;
  t(key: MessageKey): string;
}

/**
 * v3.0 M1：桌宠伴身交互。
 *
 * - 首次见面：本地标记缺失时开场说一句（之后不再重复）；
 * - 右键快捷动作：静音 / 主动说话走语音设置（跨窗口广播即时生效），
 *   干饭 / 炸毛直接播放内置场戏；
 * - 均为本地能力，不产生模型调用。
 */
export function usePetCompanion(args: PetCompanionArgs): void {
  const argsRef = React.useRef(args);
  argsRef.current = args;
  const voice = useVoiceSettings();
  const voiceRef = React.useRef(voice);
  voiceRef.current = voice;

  // 首次见面：每次安装只问候一次（清 localStorage 可重置）
  React.useEffect(() => {
    if (!args.linesEnabled) return;
    let firstMeet = false;
    try {
      firstMeet = window.localStorage.getItem(FIRST_MEET_KEY) !== '1';
    } catch {
      return;
    }
    if (!firstMeet) return;
    const timer = window.setTimeout(() => {
      // 标记只在真正开口后写入：StrictMode 的挂载→清理→再挂载不会吞掉问候
      try {
        window.localStorage.setItem(FIRST_MEET_KEY, '1');
      } catch {
        // 存储禁用时仍允许问候，只是下次还会触发
      }
      const a = argsRef.current;
      a.showLine(a.t(pickPetLine('first-meet', Math.random())), 4200);
    }, FIRST_MEET_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [args.linesEnabled]);

  // 右键菜单勾选态：把静音/主动说话同步给主进程（主进程只缓存，不持久化设置）
  React.useEffect(() => {
    const bridge = getPetBridge();
    if (!bridge || typeof bridge.reportCompanionSettings !== 'function') return;
    bridge.reportCompanionSettings({
      muted: !(voice.settings?.ttsEnabled ?? true),
      proactive: voice.settings?.proactiveEnabled ?? false,
    });
  }, [voice.settings?.ttsEnabled, voice.settings?.proactiveEnabled]);

  const handle = React.useCallback(async (action: PetQuickAction) => {
    const a = argsRef.current;
    if (action === 'play-eat-rice') {
      a.script.playScene('moment.eat-rice');
      return;
    }
    if (action === 'play-called-fat') {
      a.script.playScene('moment.called-fat');
      return;
    }
    const v = voiceRef.current;
    try {
      if (action === 'toggle-mute') {
        const next = !(v.settings?.ttsEnabled ?? true);
        await v.update({ ttsEnabled: next });
        a.showLine(a.t(next ? 'emotion.quick.muteOff' : 'emotion.quick.muteOn'), 2600);
        return;
      }
      const next = !(v.settings?.proactiveEnabled ?? false);
      await v.update({ proactiveEnabled: next });
      a.showLine(a.t(next ? 'emotion.quick.proactiveOn' : 'emotion.quick.proactiveOff'), 2600);
    } catch {
      // 设置写失败不打断桌宠，用户可再次从菜单触发
    }
  }, []);

  React.useEffect(() => {
    const bridge = getPetBridge();
    // 旧版桌面壳未重建 preload 时没有该桥：静默跳过，避免整页报错
    if (!bridge || typeof bridge.onQuickAction !== 'function') return;
    return bridge.onQuickAction((action) => {
      void handle(action);
    });
  }, [handle]);
}
