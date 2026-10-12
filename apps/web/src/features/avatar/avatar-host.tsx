'use client';

import * as React from 'react';
import type { Message } from '@wbfm/shared/types';
import { useI18n } from '@/lib/i18n/use-i18n';
import { Live2dCanvas } from './live2d-canvas';
import type { Live2dController } from './live2d-controller';
import { DEFAULT_EXPRESSION } from './expression-parser';
import { useHeadTouch, type TouchControllerLike } from './use-head-touch';
import { useEmotionExpression } from './use-emotion-expression';

interface AvatarHostProps {
  /** 当前会话消息（含流式 live 消息），用于从回复标签推导表情 */
  messages: Message[];
  /** TTS 播放电平读取器（口型） */
  getLevel: () => number;
  /** 是否正在朗读 */
  speaking: boolean;
  /** 模型 id（语音设置 avatarModelId） */
  modelId: string;
  /** 当前助手 id（v1.6：情绪基线拉取） */
  assistantId: string;
  /** F8：主动轮气泡文本（存在时表情优先跟随它） */
  proactiveContent?: string | null;
}

/**
 * 对话页形象区：Live2D 画布 + 状态角标。
 * v1.6：表情经 useEmotionExpression 融合（内联标签优先，无标签回落情绪基线），
 * 头部摸头给害羞/抗议反馈（rail 不出短句，短句在桌宠气泡呈现）。
 */
export function AvatarHost({
  messages,
  getLevel,
  speaking,
  modelId,
  assistantId,
  proactiveContent = null,
}: AvatarHostProps) {
  const { t } = useI18n();
  const expression = useEmotionExpression(assistantId, messages, proactiveContent);
  // 舞台内 Live2dController 由动态 chunk 创建；ref 结构兼容触摸所需动作子集
  const controllerRef = React.useRef<Live2dController | null>(null);
  const onHeadTouch = useHeadTouch(
    controllerRef as React.MutableRefObject<TouchControllerLike | null>,
  );

  return (
    <div className="flex h-full flex-col" data-testid="avatar-host">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">{t('avatar.rail.title')}</span>
        <span
          className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
          data-testid="avatar-state"
          data-state={speaking ? 'speaking' : 'idle'}
        >
          {speaking
            ? t('avatar.state.speaking')
            : expression === DEFAULT_EXPRESSION
              ? t('avatar.state.idle')
              : expression}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <Live2dCanvas
          modelId={modelId}
          expression={expression}
          getLevel={getLevel}
          speaking={speaking}
          controllerRef={controllerRef}
          onHeadTouch={() => onHeadTouch()}
        />
      </div>
    </div>
  );
}
