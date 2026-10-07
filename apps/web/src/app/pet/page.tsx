'use client';

import * as React from 'react';
import { getAvatarModel } from '@/features/avatar/avatar-models';
import { PetStage } from '@/features/pet/pet-stage';
import { readPetModelId } from '@/features/pet/pet-bridge';
import { usePetBridge } from '@/features/pet/use-pet-bridge';

/**
 * /pet：桌宠窗独立路由（不进 (main) 布局，无侧栏、透明背景）。
 * 瘦终端——无麦克风、无聊天请求；模型 id 经 ?model= 传入，全部表现数据走 pet IPC。
 * 裸浏览器访问（无桌面桥）时由 usePetBridge 重定向回 /chat。
 */
export default function PetPage() {
  const runtime = usePetBridge();
  const [mounted, setMounted] = React.useState(false);
  // query 仅客户端可读；挂载后取值，避免 SSR/首帧 hydration 不一致
  const [modelId, setModelId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setModelId(readPetModelId() ?? '');
    setMounted(true);
  }, []);

  if (!mounted || !runtime.ready) {
    return <div data-testid="pet-booting" className="h-screen w-screen bg-transparent" />;
  }

  const spec = getAvatarModel(modelId);
  return (
    <PetStage
      modelId={spec.id}
      expression={runtime.expression}
      voiceState={runtime.voiceState}
      subtitle={runtime.subtitle}
      getLevel={runtime.getLevel}
    />
  );
}
