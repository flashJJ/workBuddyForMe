'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PetStage } from '@/features/pet';
import { getPetBridge, readPetModelId, usePetBridge } from '@/features/pet/bridge';
import { useVoiceSettings } from '@/features/voice';
import { normalizeAvatarModelId } from '@wbfm/shared/pet';

/**
 * /pet：桌宠窗独立路由（不进 (main) 布局，无侧栏、透明背景）。
 * 瘦终端——无麦克风、无聊天请求；模型 id 经 ?model= 传入，全部表现数据走 pet IPC。
 *
 * ⚠️ 关于 preload：
 *   如果 Electron preload 正常注入 window.wbfm.pet，ready=true，PetStage 跑完整功能。
 *   如果 preload 未注入（sandbox/transparent 某些组合下可能丢 preload），bridge 为 null，
 *   但只要 URL query 里有 modelId（桌宠窗口创建时带的），**仍然渲染 PetStage** —— 这样
 *   至少 VRM/Live2D 画布能 mount、GLTFLoader 能加载二进制。语音/表情事件降级为空值。
 *   裸浏览器直接访问 /pet（无 query）时才重定向。
 */
export default function PetPage() {
  const router = useRouter();
  const runtime = usePetBridge();
  const [mounted, setMounted] = React.useState(false);
  const [modelId, setModelId] = React.useState<string | null>(null);
  /** 设置真源兜底：主进程热替换未回执/广播延迟时，桌宠也能跟随角色切换 */
  const { settings: voiceSettings } = useVoiceSettings();
  const settingsModelId = voiceSettings?.avatarModelId;

  React.useEffect(() => {
    // 水合后再打一次标，防止首帧/React 调和期间丢失 data-pet 而露出主题底色
    document.documentElement.dataset.pet = '1';
    setModelId(readPetModelId() ?? '');
    setMounted(true);
  }, []);

  // 裸浏览器访问 /pet 无 query —— 重定向回主对话页
  React.useEffect(() => {
    if (mounted && !modelId && !runtime.ready) {
      router.replace('/chat');
    }
  }, [mounted, modelId, runtime.ready, router]);

  // v3.0 P4：主进程同窗口换模型 → 热替换 + 回执（主进程收不到回执会回退重建窗口）
  React.useEffect(() => {
    const bridge = getPetBridge();
    // 正在运行的旧桌面壳尚未重建 preload：没有该桥时保持旧行为，避免整页报错
    if (!bridge || typeof bridge.onModelChange !== 'function') return;
    return bridge.onModelChange((next) => {
      const id = normalizeAvatarModelId(next);
      setModelId(id);
      if (typeof bridge.confirmModel === 'function') bridge.confirmModel(id);
      // dev HMR/刷新后仍能从 query 读到最新模型
      window.history.replaceState(null, '', `?model=${encodeURIComponent(id)}`);
    });
  }, []);

  // 设置广播兜底：切换角色后立即重载，不再依赖主进程换模型消息/回执
  const settingsSyncedRef = React.useRef(false);
  React.useEffect(() => {
    if (!settingsModelId) return;
    const next = normalizeAvatarModelId(settingsModelId);
    if (!settingsSyncedRef.current) {
      settingsSyncedRef.current = true;
      // 首次加载：URL 已显式指定模型（pet.open(modelId)）时以 URL 为准，
      // 避免默认设置把它覆盖成另一套舞台；后续设置变更仍会触发热替换
      if (readPetModelId()) return;
    }
    if (next === modelId) return;
    setModelId(next);
    const bridge = getPetBridge();
    if (typeof bridge?.confirmModel === 'function') bridge.confirmModel(next);
    window.history.replaceState(null, '', `?model=${encodeURIComponent(next)}`);
  }, [settingsModelId, modelId]);

  if (!mounted || !modelId) {
    return <div data-testid="pet-booting" className="h-screen w-screen bg-transparent" />;
  }

  return (
    <PetStage
      modelId={modelId}
      expression={runtime.expression}
      voiceState={runtime.voiceState}
      subtitle={runtime.subtitle}
      getLevel={runtime.getLevel}
      relationshipLevel={runtime.relationshipLevel}
      mood={runtime.mood}
    />
  );
}
