'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PetStage } from '@/features/pet/pet-stage';
import { readPetModelId } from '@/features/pet/pet-bridge';
import { usePetBridge } from '@/features/pet/use-pet-bridge';

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

  React.useEffect(() => {
    setModelId(readPetModelId() ?? '');
    setMounted(true);
  }, []);

  // 裸浏览器访问 /pet 无 query —— 重定向回主对话页
  React.useEffect(() => {
    if (mounted && !modelId && !runtime.ready) {
      router.replace('/chat');
    }
  }, [mounted, modelId, runtime.ready, router]);

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
    />
  );
}
