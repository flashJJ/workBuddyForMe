'use client';

import * as React from 'react';
import type { Message } from '@wbfm/shared/types';
import {
  baselineExpression,
  type EmotionState,
  type ExpressionTag,
} from '@wbfm/shared/schemas';
import { apiGet } from '@/lib/api/client';
import { DEFAULT_EXPRESSION, latestExpression } from './expression-parser';

/**
 * v1.6 M3 形象栏表情源：
 * 1. 流式/最近助手回复里的内联 [表情] 标签优先（说话过程实时）；
 * 2. 无显式标签时回落到持久化情绪基线（GET emotion 的 baselineExpression）——
 *    回复结束后表情不再瞬间清零，而是由跨轮情绪状态承接「余韵」。
 *
 * 基线在助手切换与助手消息条数变化时刷新；拉取失败静默回落 neutral。
 */
export function useEmotionExpression(
  assistantId: string,
  messages: Message[],
  proactiveContent?: string | null,
): ExpressionTag {
  const [baseline, setBaseline] = React.useState<ExpressionTag>(DEFAULT_EXPRESSION);

  const assistantMessageCount = React.useMemo(
    () => messages.filter((m) => m.role === 'assistant').length,
    [messages],
  );

  React.useEffect(() => {
    let cancelled = false;
    apiGet<EmotionState>(`/api/assistants/${assistantId}/emotion`)
      .then((state) => {
        if (!cancelled && state) setBaseline(baselineExpression(state));
      })
      .catch(() => {
        /* 情绪基线拉取失败不影响对话形象 */
      });
    return () => {
      cancelled = true;
    };
  }, [assistantId, assistantMessageCount]);

  return React.useMemo(() => {
    if (proactiveContent) {
      const tag = latestExpression(proactiveContent);
      if (tag) return tag;
    }
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message?.role === 'assistant') {
        return latestExpression(message.content) ?? baseline;
      }
    }
    return baseline;
  }, [messages, proactiveContent, baseline]);
}
