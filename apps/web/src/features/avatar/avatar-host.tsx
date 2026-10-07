'use client';

import * as React from 'react';
import type { Message } from '@wbfm/shared';
import { Live2dCanvas } from './live2d-canvas';
import {
  DEFAULT_EXPRESSION,
  latestExpression,
  type ExpressionTag,
} from './expression-parser';

interface AvatarHostProps {
  /** 当前会话消息（含流式 live 消息），用于从回复标签推导表情 */
  messages: Message[];
  /** TTS 播放电平读取器（口型） */
  getLevel: () => number;
  /** 是否正在朗读 */
  speaking: boolean;
  /** 模型 id（语音设置 avatarModelId） */
  modelId: string;
  /** F8：主动轮气泡文本（存在时表情优先跟随它） */
  proactiveContent?: string | null;
}

/** 取表情：F8 主动轮进行时以主动气泡内容为准，否则取最后一条助手消息 */
function useLastAssistantExpression(messages: Message[], proactiveContent?: string | null): ExpressionTag {
  return React.useMemo(() => {
    if (proactiveContent) {
      const proactiveTag = latestExpression(proactiveContent);
      if (proactiveTag) return proactiveTag;
    }
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.role === 'assistant') {
        return latestExpression(m.content) ?? DEFAULT_EXPRESSION;
      }
    }
    return DEFAULT_EXPRESSION;
  }, [messages, proactiveContent]);
}

/**
 * 对话页形象区（M3）：Live2D 画布 + 状态角标。
 * 挂在独立右侧栏；组件本身轻量，重资源经 live2d-canvas 动态切 chunk。
 */
export function AvatarHost({ messages, getLevel, speaking, modelId, proactiveContent = null }: AvatarHostProps) {
  const expression = useLastAssistantExpression(messages, proactiveContent);
  return (
    <div className="flex h-full flex-col" data-testid="avatar-host">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">本地形象</span>
        <span
          className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
          data-testid="avatar-state"
          data-state={speaking ? 'speaking' : 'idle'}
        >
          {speaking ? '说话中' : expression === DEFAULT_EXPRESSION ? '待机' : expression}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <Live2dCanvas
          modelId={modelId}
          expression={expression}
          getLevel={getLevel}
          speaking={speaking}
        />
      </div>
    </div>
  );
}
